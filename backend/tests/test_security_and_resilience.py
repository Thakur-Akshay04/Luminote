import asyncio
import io
import logging
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import groq
import httpx
from fastapi import UploadFile
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.config import Settings
from app.database import _build_connect_args, engine, init_db
from app.observability import (
    MetricsCollector,
    RequestIdFilter,
    audit_log,
    metrics,
    request_id_ctx,
    sanitize_log_value,
)
from app.schemas.alert import AlertCreate
from app.schemas.note import AIActionRequest, AskRequest, NoteCreate, SummarizeRequest
from app.schemas.search import SearchRequest
from app.schemas.users import ChangeNameRequest
from app.services.ai_service import _extract_json_content
from app.services.ai_tasks import extract_tasks
from app.services.email_service import send_verification_email
from app.services.file_security import ALLOWED_AUDIO_TYPES, ALLOWED_IMAGE_TYPES, validate_file
from app.services.note_service import decode_note_cursor, encode_note_cursor, get_notes
from app.services.resilience import (
    CircuitBreaker,
    CircuitBreakerOpenError,
    call_groq_chat,
    is_retryable_provider_error,
)


class ConfigAndDatabaseTests(unittest.IsolatedAsyncioTestCase):
    def test_production_requires_jwt_secret(self):
        with self.assertRaises(ValueError):
            Settings(env="production", jwt_secret="", _env_file=None)

    def test_dev_generates_ephemeral_jwt_secret(self):
        s = Settings(env="development", jwt_secret="", _env_file=None)
        self.assertTrue(len(s.jwt_secret) >= 32)

    def test_db_ssl_require_preserves_stronger_url_modes(self):
        with patch("app.database.settings.db_ssl_require", True):
            full_args = _build_connect_args("postgresql+asyncpg://u:p@db/app?ssl=verify-full")
            self.assertNotIn("ssl", full_args)

            ca_args = _build_connect_args("postgresql+asyncpg://u:p@db/app?sslmode=verify-ca")
            self.assertNotIn("ssl", ca_args)

            plain_args = _build_connect_args("postgresql+asyncpg://u:p@db/app")
            self.assertEqual(plain_args["ssl"], "require")

            disabled_args = _build_connect_args("postgresql+asyncpg://u:p@db/app?ssl=disable")
            self.assertEqual(disabled_args["ssl"], "require")

    def test_migration_connect_args_use_migration_timeouts(self):
        req_args = _build_connect_args("postgresql+asyncpg://u:p@db/app", for_migrations=False)
        mig_args = _build_connect_args("postgresql+asyncpg://u:p@db/app", for_migrations=True)
        self.assertGreater(mig_args["command_timeout"], req_args["command_timeout"])
        self.assertGreater(
            int(mig_args["server_settings"]["statement_timeout"]),
            int(req_args["server_settings"]["statement_timeout"]),
        )

    def test_checkin_hook_subtracts_returning_connection(self):
        sync_pool = engine.sync_engine.pool
        with (
            patch.object(sync_pool, "checkedout", return_value=1),
            patch.object(sync_pool, "overflow", return_value=1),
            patch.object(sync_pool, "checkedin", return_value=10),
            patch.object(sync_pool, "size", return_value=10),
        ):
            sync_pool.dispatch.checkin(None, None)
            self.assertEqual(metrics._gauges[("db_pool_checked_out", ())], 0.0)
            self.assertEqual(metrics._gauges[("db_pool_overflow", ())], 0.0)

    async def test_init_db_uses_migration_engine_and_disposes(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=MagicMock(fetchone=lambda: (384,)))
        mock_conn.run_sync = AsyncMock()

        mock_begin_cm = MagicMock()
        mock_begin_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_begin_cm.__aexit__ = AsyncMock(return_value=False)

        mock_mig_engine = MagicMock()
        mock_mig_engine.begin.return_value = mock_begin_cm
        mock_mig_engine.dispose = AsyncMock()

        with (
            patch("app.database.settings.run_db_migrations", True),
            patch("app.database._build_engine", return_value=mock_mig_engine) as build_mock,
        ):
            await init_db()
            build_mock.assert_called_once_with(for_migrations=True)
            mock_mig_engine.dispose.assert_awaited_once()


class SchemaValidationTests(unittest.TestCase):
    def test_note_title_sanitized_and_content_bounded(self):
        note = NoteCreate(title="<script>alert(1)</script>My Note", content="Hello")
        self.assertEqual(note.title, "alert(1)My Note")
        with self.assertRaises(ValidationError):
            NoteCreate(title="ok", content="x" * 500_001)

    def test_ask_summarize_search_alert_validation(self):
        with self.assertRaises(ValidationError):
            AskRequest(question="")
        with self.assertRaises(ValidationError):
            AskRequest(question="a" * 4001)
        with self.assertRaises(ValidationError):
            SummarizeRequest(format="invalid")  # type: ignore[arg-type]
        with self.assertRaises(ValidationError):
            AIActionRequest(action="unknown", text="hi")  # type: ignore[arg-type]
        with self.assertRaises(ValidationError):
            SearchRequest(query="q" * 513)

        alert = AlertCreate(
            note_id="11111111-1111-1111-1111-111111111111",  # type: ignore[arg-type]
            title="<b>Call Mom</b>",
            alert_time="2026-12-01T09:00:00Z",  # type: ignore[arg-type]
        )
        self.assertEqual(alert.title, "Call Mom")

    def test_display_name_allows_unicode_and_rejects_symbols(self):
        req = ChangeNameRequest(display_name="José-María O'Connor")
        self.assertEqual(req.display_name, "José-María O'Connor")
        with self.assertRaises(ValidationError):
            ChangeNameRequest(display_name="bad<script>!")


class FileSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_read_rejects_oversized_file(self):
        big_data = b"a" * 2048
        upload = UploadFile(file=io.BytesIO(big_data), filename="test.png")
        with self.assertRaises(Exception) as ctx:
            await validate_file(upload, ALLOWED_IMAGE_TYPES, max_size=1024)
        self.assertEqual(getattr(ctx.exception, "status_code", None), 413)

    async def test_octet_stream_requires_valid_audio_extension(self):
        payload = b"\x00\x01\x02\x03randombinary"
        bad_upload = UploadFile(file=io.BytesIO(payload), filename="../../malware.exe")
        with patch("app.services.file_security.magic.from_buffer", return_value="application/octet-stream"):
            with self.assertRaises(Exception) as ctx:
                await validate_file(bad_upload, ALLOWED_AUDIO_TYPES, max_size=1024)
            self.assertEqual(getattr(ctx.exception, "status_code", None), 400)

        good_upload = UploadFile(file=io.BytesIO(payload), filename="dir/recording.webm")
        with patch("app.services.file_security.magic.from_buffer", return_value="application/octet-stream"):
            contents, safe_name = await validate_file(good_upload, ALLOWED_AUDIO_TYPES, max_size=1024)
            self.assertEqual(contents, payload)
            self.assertEqual(safe_name, "recording.webm")


class ObservabilityAndEmailTests(unittest.IsolatedAsyncioTestCase):
    def test_sanitize_log_value_prevents_crlf_injection(self):
        self.assertEqual(sanitize_log_value("abc\r\nFAKE LOG"), "abc\\r\\nFAKE LOG")

    def test_prometheus_label_escaping_handles_backslash_quotes_newlines(self):
        mc = MetricsCollector()
        mc.inc_counter("esc_test", {"v1": r'a\qb', "v2": 'say "hi"', "v3": "line1\nline2", "ok": "200"})
        prom = mc.render_prometheus()
        self.assertIn(r'ok="200"', prom)
        self.assertIn(r'v1="a\\qb"', prom)
        self.assertIn(r'v2="say \"hi\""', prom)
        self.assertIn(r'v3="line1\nline2"', prom)

    def test_request_id_filter_and_metrics_prometheus(self):
        token = request_id_ctx.set("req-1234")
        try:
            rec = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)
            RequestIdFilter().filter(rec)
            self.assertEqual(rec.request_id, "req-1234")  # type: ignore[attr-defined]
        finally:
            request_id_ctx.reset(token)

        mc = MetricsCollector()
        mc.inc_counter("test_requests_total", {"status": "200"})
        mc.set_gauge("test_pool_active", 3.0)
        mc.observe_latency("test_latency_ms", 42.5)
        prom = mc.render_prometheus()
        self.assertIn('test_requests_total{status="200"} 1.0', prom)
        self.assertIn("test_pool_active 3.0", prom)
        self.assertIn("test_latency_ms_count 1", prom)

        with self.assertLogs("luminote.audit", level="INFO") as audit_cm:
            audit_log("test_action", user_id="u1", ip="127.0.0.1", detail="ok\nline")
        self.assertIn("AUDIT action=test_action", audit_cm.output[0])
        self.assertNotIn("\n", audit_cm.output[0])

    async def test_email_service_never_logs_raw_token(self):
        with self.assertLogs("app.services.email_service", level="INFO") as cm:
            with patch("app.services.email_service.settings.sendgrid_api_key", ""):
                await send_verification_email("user-1", "alice@example.com")
        joined = "\n".join(cm.output)
        self.assertNotIn("token=", joined)
        self.assertIn("al***@example.com", joined)


class AIExtractionTests(unittest.IsolatedAsyncioTestCase):
    def test_extract_json_content_preserves_arrays_and_objects(self):
        self.assertEqual(_extract_json_content('[{"text":"Call Sam"}]'), '[{"text":"Call Sam"}]')
        self.assertEqual(
            _extract_json_content('Tasks:\n[{"text":"A"},{"text":"B"}]\nDone'),
            '[{"text":"A"},{"text":"B"}]',
        )
        self.assertEqual(
            _extract_json_content('```json\n[{"text":"Fenced"}]\n```'),
            '[{"text":"Fenced"}]',
        )
        self.assertEqual(
            _extract_json_content('Result: {"summary":"ok","tags":["x"]}'),
            '{"summary":"ok","tags":["x"]}',
        )

    async def test_extract_tasks_parses_plain_json_arrays(self):
        fake_resp = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='[{"text":"Call Sam"},{"text":"Send report"}]'))]
        )
        with patch("app.services.ai_tasks.call_groq_chat", new=AsyncMock(return_value=fake_resp)):
            tasks = await extract_tasks("Call Sam and send report")
            self.assertEqual(len(tasks), 2)
            self.assertEqual(tasks[0]["text"], "Call Sam")
            self.assertEqual(tasks[1]["text"], "Send report")


class ResilienceAndCursorTests(unittest.IsolatedAsyncioTestCase):
    async def test_circuit_breaker_lifecycle_and_generation_isolation(self):
        cb = CircuitBreaker("test_svc", failure_threshold=2, recovery_timeout=0.05)

        async def fail():
            raise RuntimeError("boom")

        async def ok():
            return "ok"

        # Simulate an early in-flight request from gen 0 finishing AFTER gen 0 trips to open (gen 1)
        early_gen = await cb.allow_request()
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                await cb.call(fail)

        self.assertEqual(cb.state, "open")
        await cb.record_success(early_gen)
        # Stale completion from gen 0 must NOT close the circuit
        self.assertEqual(cb.state, "open")

        with self.assertRaises(CircuitBreakerOpenError):
            await cb.call(ok)

        await asyncio.sleep(0.06)
        self.assertEqual(await cb.call(ok), "ok")
        self.assertEqual(cb.state, "closed")

    async def test_half_open_bounds_concurrent_probes_and_cancellation_releases(self):
        cb = CircuitBreaker("half_open_svc", failure_threshold=1, recovery_timeout=0.02)
        with self.assertRaises(RuntimeError):
            await cb.call(AsyncMock(side_effect=RuntimeError("down")))
        self.assertEqual(cb.state, "open")

        await asyncio.sleep(0.03)
        entered = asyncio.Event()
        release = asyncio.Event()

        async def slow_probe():
            entered.set()
            await release.wait()
            return "probe-ok"

        probe_task = asyncio.create_task(cb.call(slow_probe))
        await entered.wait()
        self.assertEqual(cb.state, "half_open")

        # Concurrent second caller while probe is in flight must be rejected fast
        with self.assertRaises(CircuitBreakerOpenError):
            await cb.call(AsyncMock(return_value="should-reject"))

        # Cancel probe -> must release reservation without tripping back to open
        probe_task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await probe_task

        # Subsequent probe can proceed and close the circuit
        res = await cb.call(AsyncMock(return_value="recovered"))
        self.assertEqual(res, "recovered")
        self.assertEqual(cb.state, "closed")

    async def test_permanent_input_errors_and_cancellation_do_not_retry_or_trip(self):
        self.assertFalse(is_retryable_provider_error(asyncio.CancelledError()))
        self.assertFalse(is_retryable_provider_error(CircuitBreakerOpenError("groq", 1.0)))

        req = httpx.Request("POST", "https://api.groq.com/test")
        resp_400 = httpx.Response(400, request=req)
        bad_req = groq.BadRequestError("invalid model param", response=resp_400, body=None)
        self.assertFalse(is_retryable_provider_error(bad_req))

        mock_create = AsyncMock(side_effect=bad_req)
        with (
            patch("app.groq_client.client.chat.completions.create", mock_create),
            patch("app.services.resilience.groq_breaker", CircuitBreaker("groq_t1", failure_threshold=2)),
        ):
            with self.assertRaises(Exception) as ctx:
                await call_groq_chat(messages=[{"role": "user", "content": "hi"}], model="m")
            self.assertEqual(getattr(ctx.exception, "status_code", None), 400)
            self.assertEqual(mock_create.await_count, 1)

    async def test_open_breaker_fails_immediately_without_tenacity_retries(self):
        open_breaker = CircuitBreaker("groq_open", failure_threshold=1, recovery_timeout=60.0)
        await open_breaker.record_failure(open_breaker.generation)
        self.assertEqual(open_breaker.state, "open")

        mock_create = AsyncMock()
        with (
            patch("app.groq_client.client.chat.completions.create", mock_create),
            patch("app.services.resilience.groq_breaker", open_breaker),
            patch("asyncio.sleep", new=AsyncMock()) as sleep_mock,
        ):
            with self.assertRaises(Exception) as ctx:
                await call_groq_chat(messages=[{"role": "user", "content": "hi"}], model="m")
            self.assertEqual(getattr(ctx.exception, "status_code", None), 503)
            mock_create.assert_not_awaited()
            sleep_mock.assert_not_awaited()

    async def test_note_cursor_roundtrip_and_sql_construction_without_bool_lt(self):
        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)

        for is_pinned_val in (True, False):
            fake_note = SimpleNamespace(id=uid, is_pinned=is_pinned_val, updated_at=now)
            cursor = encode_note_cursor(fake_note)  # type: ignore[arg-type]
            pinned, ts, decoded_id = decode_note_cursor(cursor)
            self.assertEqual(pinned, is_pinned_val)
            self.assertEqual(ts, now)
            self.assertEqual(decoded_id, uid)

            # Verify get_notes builds valid SQL without SQLAlchemy ArgumentError on Boolean <
            captured_stmts = []

            async def fake_execute(stmt):
                captured_stmts.append(stmt)
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

            fake_db = SimpleNamespace(execute=AsyncMock(side_effect=fake_execute))
            await get_notes(uid, None, None, fake_db, limit=10, cursor=cursor)  # type: ignore[arg-type]
            compiled = str(captured_stmts[0].compile(dialect=postgresql.dialect())).lower()
            self.assertNotIn("is_pinned <", compiled)
            if is_pinned_val:
                self.assertIn("is_pinned = true", compiled)
                self.assertIn("is_pinned = false", compiled)
            else:
                self.assertIn("is_pinned = false", compiled)
                self.assertNotIn("is_pinned = true", compiled)


if __name__ == "__main__":
    unittest.main()
