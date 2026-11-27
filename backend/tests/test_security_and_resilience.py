import asyncio
import io
import json
import logging
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import UploadFile
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.observability import (
    MetricsCollector,
    RequestIdFilter,
    audit_log,
    request_id_ctx,
    sanitize_log_value,
)
from app.schemas.alert import AlertCreate
from app.schemas.note import AIActionRequest, AskRequest, NoteCreate, SummarizeRequest
from app.schemas.search import SearchRequest
from app.schemas.users import ChangeNameRequest
from app.services.email_service import send_verification_email
from app.services.file_security import ALLOWED_AUDIO_TYPES, ALLOWED_IMAGE_TYPES, validate_file
from app.services.note_service import decode_note_cursor, encode_note_cursor
from app.services.resilience import CircuitBreaker, CircuitBreakerOpenError


class ConfigSecurityTests(unittest.TestCase):
    def test_production_requires_jwt_secret(self):
        with self.assertRaises(ValueError):
            Settings(env="production", jwt_secret="", _env_file=None)

    def test_dev_generates_ephemeral_jwt_secret(self):
        s = Settings(env="development", jwt_secret="", _env_file=None)
        self.assertTrue(len(s.jwt_secret) >= 32)


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


class ResilienceAndCursorTests(unittest.IsolatedAsyncioTestCase):
    async def test_circuit_breaker_lifecycle(self):
        cb = CircuitBreaker("test_svc", failure_threshold=2, recovery_timeout=0.05)

        async def fail():
            raise RuntimeError("boom")

        async def ok():
            return "ok"

        for _ in range(2):
            with self.assertRaises(RuntimeError):
                await cb.call(fail)

        self.assertEqual(cb.state, "open")
        with self.assertRaises(CircuitBreakerOpenError):
            await cb.call(ok)

        await asyncio.sleep(0.06)
        self.assertEqual(await cb.call(ok), "ok")
        self.assertEqual(cb.state, "closed")

    def test_note_cursor_roundtrip(self):
        from datetime import datetime, timezone
        import uuid

        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)
        fake_note = SimpleNamespace(id=uid, is_pinned=True, updated_at=now)
        token = encode_note_cursor(fake_note)  # type: ignore[arg-type]
        pinned, ts, decoded_id = decode_note_cursor(token)
        self.assertTrue(pinned)
        self.assertEqual(ts, now)
        self.assertEqual(decoded_id, uid)


if __name__ == "__main__":
    unittest.main()
