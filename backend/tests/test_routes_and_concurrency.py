import asyncio
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request


def _make_request(path: str = "/test") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)

from app.auth.clerk import get_current_user
from app.database import get_db
from app.main import RequestSizeLimitMiddleware, app
from app.routers.audio import transcribe_audio
from app.routers.payments import (
    CreateOrderRequest,
    _atomic_complete_purchase,
    create_order,
    get_razorpay_client,
)


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
        # Content-Length header exceeding limit
        res = self.client.post(
            "/search",
            content=b'{"query": "hello"}',
            headers={"Content-Length": str(11 * 1024 * 1024)},
        )
        self.assertEqual(res.status_code, 413)

        # Direct ASGI test for chunked body without Content-Length exceeding limit
        async def run_chunked():
            called = False

            async def dummy_app(scope, receive, send):
                nonlocal called
                called = True
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
        # Simulate two concurrent callers: first UPDATE returns row, second returns None
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

    async def test_create_order_idempotency_key_returns_cached(self):
        cached = json.dumps({
            "order_id": "order_cached_1",
            "amount": 4900,
            "currency": "INR",
            "razorpay_key_id": "rzp_test",
        })
        req = _make_request("/payments/create-order")
        db = AsyncMock()
        with patch("app.routers.payments.redis_get_safe", new=AsyncMock(return_value=cached)):
            with patch("app.routers.payments.get_razorpay_client") as mock_client:
                resp = await create_order(
                    request=req,  # type: ignore[arg-type]
                    body=CreateOrderRequest(credit_package="starter"),
                    user_id=str(uuid.uuid4()),
                    db=db,
                    idempotency_key="idem-abc-123",
                )
                mock_client.assert_not_called()
                self.assertEqual(resp.order_id, "order_cached_1")


class AudioCreditSafetyTests(unittest.IsolatedAsyncioTestCase):
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
                    request=req,  # type: ignore[arg-type]
                    note_id=note_id,
                    user_id=user_id,
                    db=db,
                )
            self.assertEqual(ctx.exception.status_code, 502)
            mock_ensure.assert_awaited_once()
            mock_deduct.assert_not_awaited()


class SearchAndPaginationRouteTests(unittest.TestCase):
    def setUp(self):
        self.uid = str(uuid.uuid4())
        app.dependency_overrides[get_current_user] = lambda: self.uid

        async def override_db():
            yield AsyncMock()

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_search_hides_internal_embedding_error_details(self):
        with (
            patch("app.routers.search.get_search_version", new=AsyncMock(return_value="1")),
            patch("app.routers.search.redis_get_safe", new=AsyncMock(return_value=None)),
            patch("app.routers.search.get_embedding", new=AsyncMock(return_value=["bad-non-numeric"])),
        ):
            res = self.client.post("/search", json={"query": "project roadmap"})
            self.assertEqual(res.status_code, 500)
            self.assertNotIn("non-numeric", res.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
