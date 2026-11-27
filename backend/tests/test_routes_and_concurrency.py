import asyncio
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import groq
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from app.auth.clerk import get_current_user
from app.database import get_db
from app.main import RequestSizeLimitMiddleware, app
from app.routers.audio import _transcribe_with_retry, transcribe_audio
from app.routers.payments import (
    CreateOrderRequest,
    _atomic_complete_purchase,
    create_order,
    get_razorpay_client,
)
from app.services.resilience import CircuitBreaker


def _make_request(path: str = "/test") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


class AppMiddlewareAndHealthTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_health_reports_dependency_status(self):
        with (
            patch("app.main.check_db_health", new=AsyncMock(return_value=True)),
            patch("app.main.check_redis_health", new=AsyncMock(return_value=True)),
        ):
            res = self.client.get("/health")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "ok")
            self.assertIn("X-Request-ID", res.headers)
            self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(res.headers.get("X-Frame-Options"), "DENY")

        with (
            patch("app.main.check_db_health", new=AsyncMock(return_value=False)),
            patch("app.main.check_redis_health", new=AsyncMock(return_value=True)),
        ):
            res = self.client.get("/health")
            self.assertEqual(res.status_code, 503)
            self.assertEqual(res.json()["checks"]["database"], "down")

    def test_metrics_endpoint_and_optional_token_auth(self):
        with patch("app.main.settings.metrics_token", ""):
            res = self.client.get("/metrics")
            self.assertEqual(res.status_code, 200)
            self.assertIn("luminote_uptime_seconds", res.text)

        with patch("app.main.settings.metrics_token", "secret-metrics-token"):
            unauth = self.client.get("/metrics")
            self.assertEqual(unauth.status_code, 401)
            auth = self.client.get("/metrics", headers={"Authorization": "Bearer secret-metrics-token"})
            self.assertEqual(auth.status_code, 200)

    def test_request_size_limit_rejects_oversized_content_length_and_chunked(self):
        res = self.client.post(
            "/search",
            content=b'{"query": "hello"}',
            headers={"Content-Length": str(11 * 1024 * 1024)},
        )
        self.assertEqual(res.status_code, 413)

        async def run_chunked():
            async def dummy_app(scope, receive, send):
                while True:
                    msg = await receive()
                    if not msg.get("more_body", False):
                        break

            mw = RequestSizeLimitMiddleware(dummy_app, max_bytes=100)
            chunks = [
                {"type": "http.request", "body": b"x" * 60, "more_body": True},
                {"type": "http.request", "body": b"y" * 60, "more_body": False},
            ]

            async def receive():
                return chunks.pop(0)

            sent = []

            async def send(msg):
                sent.append(msg)

            await mw({"type": "http", "headers": []}, receive, send)
            return sent

        sent_msgs = asyncio.run(run_chunked())
        self.assertEqual(sent_msgs[0]["status"], 413)


class PaymentConcurrencyAndSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_razorpay_client_hides_missing_credentials_detail(self):
        with patch("app.routers.payments.settings.razorpay_key_id", ""):
            with self.assertRaises(HTTPException) as ctx:
                get_razorpay_client()
            self.assertEqual(ctx.exception.status_code, 503)
            self.assertNotIn("credentials", ctx.exception.detail.lower())

    async def test_atomic_complete_purchase_only_credits_first_winner(self):
        db1 = AsyncMock()
        res1 = MagicMock()
        res1.first.return_value = (500, uuid.uuid4())
        db1.execute = AsyncMock(side_effect=[res1, MagicMock()])

        db2 = AsyncMock()
        res2 = MagicMock()
        res2.first.return_value = None
        db2.execute = AsyncMock(return_value=res2)

        ok1, amt1, _ = await _atomic_complete_purchase(db1, True, "pay_123")
        ok2, amt2, _ = await _atomic_complete_purchase(db2, True, "pay_123")
        self.assertTrue(ok1)
        self.assertEqual(amt1, 500)
        self.assertFalse(ok2)
        self.assertIsNone(amt2)

    async def test_create_order_reserves_durable_db_record_and_replays_without_redis(self):
        uid = str(uuid.uuid4())
        req = _make_request("/payments/create-order")

        # 1) First request reserves in DB before calling Razorpay and commits order + completed payload
        db1 = AsyncMock()
        db1.add = MagicMock()
        db1.commit = AsyncMock()
        db1.execute = AsyncMock()

        fake_rzp = MagicMock()
        fake_rzp.order.create.return_value = {"id": "order_rzp_1"}

        with (
            patch("app.routers.payments.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.payments.redis_setex_safe", new=AsyncMock()),
            patch("app.routers.payments.get_razorpay_client", return_value=fake_rzp),
        ):
            resp1 = await create_order(
                request=req,
                body=CreateOrderRequest(credit_package="starter"),
                user_id=uid,
                db=db1,
                idempotency_key="idem-key-1",
            )
            self.assertEqual(resp1.order_id, "order_rzp_1")
            self.assertEqual(db1.commit.await_count, 2)  # 1st: reservation before gateway, 2nd: order+completed

        # 2) Retry when Redis missed (or after crash before Redis write) hits DB IntegrityError and replays
        completed_record = SimpleNamespace(
            status="completed",
            response_payload={
                "order_id": "order_rzp_1",
                "amount": 4900,
                "currency": "INR",
                "razorpay_key_id": "rzp_test",
            },
        )
        db2 = AsyncMock()
        db2.add = MagicMock()
        db2.commit = AsyncMock(side_effect=IntegrityError("dup", {}, Exception("unique")))
        db2.rollback = AsyncMock()
        db2.expire_all = MagicMock()
        db2.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: completed_record))

        with (
            patch("app.routers.payments.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.payments.redis_setex_safe", new=AsyncMock()),
            patch("app.routers.payments.get_razorpay_client") as mock_rzp,
        ):
            resp2 = await create_order(
                request=req,
                body=CreateOrderRequest(credit_package="starter"),
                user_id=uid,
                db=db2,
                idempotency_key="idem-key-1",
            )
            mock_rzp.assert_not_called()
            self.assertEqual(resp2.order_id, "order_rzp_1")

    async def test_create_order_releases_reservation_if_gateway_fails(self):
        uid = str(uuid.uuid4())
        req = _make_request("/payments/create-order")
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.execute = AsyncMock()

        fake_rzp = MagicMock()
        fake_rzp.order.create.side_effect = RuntimeError("gateway error")

        with (
            patch("app.routers.payments.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.payments.get_razorpay_client", return_value=fake_rzp),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await create_order(
                    request=req,
                    body=CreateOrderRequest(credit_package="starter"),
                    user_id=uid,
                    db=db,
                    idempotency_key="idem-fail-1",
                )
            self.assertEqual(ctx.exception.status_code, 502)
            # Release deleted the in-progress reservation row
            db.execute.assert_awaited_once()


class AudioCreditAndRetrySafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_transcribe_does_not_deduct_credits_when_whisper_fails(self):
        note_id = uuid.uuid4()
        user_id = str(uuid.uuid4())
        fake_note = SimpleNamespace(id=note_id, transcript=None)
        db = AsyncMock()
        req = _make_request("/notes/transcribe")

        with (
            patch("app.routers.audio.get_note", new=AsyncMock(return_value=fake_note)),
            patch("app.routers.audio.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.audio.ensure_sufficient_credits", new=AsyncMock()) as mock_ensure,
            patch("app.routers.audio.check_and_deduct_credits", new=AsyncMock()) as mock_deduct,
            patch("app.routers.audio.glob.glob", return_value=["/tmp/fake.webm"]),
            patch("app.routers.audio.aiofiles.open") as mock_open,
            patch("app.routers.audio._transcribe_with_retry", new=AsyncMock(side_effect=RuntimeError("Groq down"))),
        ):
            mock_file = AsyncMock()
            mock_file.read = AsyncMock(return_value=b"audio")
            mock_open.return_value.__aenter__.return_value = mock_file

            with self.assertRaises(HTTPException) as ctx:
                await transcribe_audio(
                    request=req,
                    note_id=note_id,
                    user_id=user_id,
                    db=db,
                )
            self.assertEqual(ctx.exception.status_code, 502)
            mock_ensure.assert_awaited_once()
            mock_deduct.assert_not_awaited()

    async def test_transcribe_retry_excludes_cancellation_and_400_bad_request(self):
        http_req = httpx.Request("POST", "https://api.groq.com/audio")
        bad_req = groq.BadRequestError("bad audio", response=httpx.Response(400, request=http_req), body=None)

        mock_create = AsyncMock(side_effect=bad_req)
        with (
            patch("app.routers.audio.client.audio.transcriptions.create", mock_create),
            patch("app.routers.audio.groq_breaker", CircuitBreaker("audio_t", failure_threshold=2)),
        ):
            with self.assertRaises(groq.BadRequestError):
                await _transcribe_with_retry(b"data", "a.webm")
            self.assertEqual(mock_create.await_count, 1)

        cancel_create = AsyncMock(side_effect=asyncio.CancelledError())
        with (
            patch("app.routers.audio.client.audio.transcriptions.create", cancel_create),
            patch("app.routers.audio.groq_breaker", CircuitBreaker("audio_c", failure_threshold=2)),
        ):
            with self.assertRaises(asyncio.CancelledError):
                await _transcribe_with_retry(b"data", "a.webm")
            self.assertEqual(cancel_create.await_count, 1)


class SearchAndPaginationRouteTests(unittest.TestCase):
    def setUp(self):
        self.uid = str(uuid.uuid4())
        app.dependency_overrides[get_current_user] = lambda: self.uid

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_search_hides_internal_embedding_error_details(self):
        async def override_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = override_db
        client = TestClient(app, raise_server_exceptions=False)

        with (
            patch("app.routers.search.get_search_version", new=AsyncMock(return_value="1")),
            patch("app.routers.search.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.search.get_embedding", new=AsyncMock(return_value=["bad-non-numeric"])),
        ):
            res = client.post("/search", json={"query": "project roadmap"})
            self.assertEqual(res.status_code, 500)
            self.assertNotIn("non-numeric", res.json()["detail"].lower())

    def test_search_sets_iterative_scan_and_orders_fts_candidates(self):
        executed_sqls: list[str] = []

        class FakeDB:
            def begin_nested(self):
                cm = MagicMock()
                cm.__aenter__ = AsyncMock(return_value=None)
                cm.__aexit__ = AsyncMock(return_value=False)
                return cm

            async def execute(self, stmt, params=None):
                executed_sqls.append(str(stmt))
                return SimpleNamespace(fetchall=lambda: [])

        async def override_db():
            yield FakeDB()

        app.dependency_overrides[get_db] = override_db
        client = TestClient(app, raise_server_exceptions=False)

        with (
            patch("app.routers.search.get_search_version", new=AsyncMock(return_value="1")),
            patch("app.routers.search.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.search.redis_setex_safe", new=AsyncMock()),
            patch("app.routers.search.get_embedding", new=AsyncMock(return_value=[0.1, 0.2, 0.3])),
        ):
            res = client.post("/search", json={"query": "roadmap"})
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(executed_sqls), 2)
            self.assertIn("SET LOCAL hnsw.iterative_scan = relaxed_order", executed_sqls[0])
            self.assertIn("ORDER BY ts_rank(", executed_sqls[1])
            self.assertIn("DESC, id DESC", executed_sqls[1])


if __name__ == "__main__":
    unittest.main()
