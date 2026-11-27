import json
import logging
import math
import time
from collections import defaultdict
from contextvars import ContextVar
from datetime import datetime, timezone
from threading import Lock
from typing import Any

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def sanitize_log_value(data: Any) -> str:
    """Sanitize untrusted values before logging to prevent CRLF / log injection."""
    if data is None:
        return ""
    text = str(data)
    return text.replace("\r", "\\r").replace("\n", "\\n").strip()


class RequestIdFilter(logging.Filter):
    """Inject the current request_id from ContextVar into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get("-")
        return True


class JsonLogFormatter(logging.Formatter):
    """Emit structured JSON log lines suitable for log aggregation pipelines."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", request_id_ctx.get("-")),
            "message": record.getMessage(),
        }
        if hasattr(record, "audit_data"):
            payload["audit"] = record.audit_data
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging(log_format: str = "text", log_level: str = "INFO") -> None:
    """Configure root logging with request_id context propagation."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    # Replace existing handlers cleanly to avoid duplicate logs on reload
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())

    if log_format.lower() == "json":
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] [req:%(request_id)s] %(name)s: %(message)s"
            )
        )
    root.addHandler(handler)


audit_logger = logging.getLogger("luminote.audit")


def audit_log(
    action: str,
    user_id: str | None = None,
    ip: str | None = None,
    outcome: str = "success",
    **details: Any,
) -> None:
    """Emit a structured security/compliance audit log entry."""
    safe_details = {k: sanitize_log_value(v) for k, v in details.items()}
    audit_payload = {
        "action": sanitize_log_value(action),
        "user_id": sanitize_log_value(user_id),
        "ip": sanitize_log_value(ip),
        "outcome": sanitize_log_value(outcome),
        "request_id": request_id_ctx.get("-"),
        **safe_details,
    }
    audit_logger.info(
        "AUDIT action=%s outcome=%s user_id=%s ip=%s details=%s",
        audit_payload["action"],
        audit_payload["outcome"],
        audit_payload["user_id"],
        audit_payload["ip"],
        json.dumps(safe_details, default=str),
        extra={"audit_data": audit_payload},
    )


class MetricsCollector:
    """Lightweight thread-safe in-memory Prometheus metrics collector."""

    _LATENCY_BUCKETS_MS = (10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0, 15000.0, 30000.0)

    def __init__(self) -> None:
        self._lock = Lock()
        self._counters: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._gauges: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._hist_buckets: dict[str, dict[float, int]] = defaultdict(lambda: defaultdict(int))
        self._hist_sum: dict[str, float] = defaultdict(float)
        self._hist_count: dict[str, int] = defaultdict(int)
        self._start_time = time.time()

    @staticmethod
    def _freeze_labels(labels: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
        if not labels:
            return ()
        return tuple(sorted((str(k), str(v)) for k, v in labels.items()))

    @staticmethod
    def _escape_label_value(val: str) -> str:
        return (
            val.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        )

    @classmethod
    def _format_labels(cls, labels: tuple[tuple[str, str], ...]) -> str:
        if not labels:
            return ""
        parts = [f'{k}="{cls._escape_label_value(v)}"' for k, v in labels]
        return "{" + ",".join(parts) + "}"

    def inc_counter(self, name: str, labels: dict[str, str] | None = None, amount: float = 1.0) -> None:
        key = (name, self._freeze_labels(labels))
        with self._lock:
            self._counters[key] += amount

    def set_gauge(self, name: str, value: float, labels: dict[str, str] | None = None) -> None:
        key = (name, self._freeze_labels(labels))
        with self._lock:
            self._gauges[key] = value

    def observe_latency(self, name: str, value_ms: float) -> None:
        with self._lock:
            self._hist_sum[name] += value_ms
            self._hist_count[name] += 1
            for b in self._LATENCY_BUCKETS_MS:
                if value_ms <= b:
                    self._hist_buckets[name][b] += 1
            self._hist_buckets[name][math.inf] += 1

    def render_prometheus(self) -> str:
        lines: list[str] = []
        with self._lock:
            lines.append("# TYPE luminote_uptime_seconds gauge")
            lines.append(f"luminote_uptime_seconds {round(time.time() - self._start_time, 2)}")

            seen_types: set[str] = set()
            for (name, labels), val in sorted(self._counters.items()):
                if name not in seen_types:
                    lines.append(f"# TYPE {name} counter")
                    seen_types.add(name)
                lines.append(f"{name}{self._format_labels(labels)} {val}")

            for (name, labels), val in sorted(self._gauges.items()):
                if name not in seen_types:
                    lines.append(f"# TYPE {name} gauge")
                    seen_types.add(name)
                lines.append(f"{name}{self._format_labels(labels)} {val}")

            for name, count in sorted(self._hist_count.items()):
                lines.append(f"# TYPE {name} histogram")
                buckets = self._hist_buckets[name]
                for b in self._LATENCY_BUCKETS_MS:
                    lines.append(f'{name}_bucket{{le="{b}"}} {buckets[b]}')
                lines.append(f'{name}_bucket{{le="+Inf"}} {buckets[math.inf]}')
                lines.append(f"{name}_sum {round(self._hist_sum[name], 3)}")
                lines.append(f"{name}_count {count}")

        return "\n".join(lines) + "\n"


metrics = MetricsCollector()
