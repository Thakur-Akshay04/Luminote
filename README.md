# Luminote

Luminote is a secure, lightweight, AI-powered note-taking and knowledge management workspace. It combines rich TipTap editing, voice note recording with Groq Whisper transcription, interactive checklists, hybrid semantic + full-text search, a visual Thought Map, real-time WebSocket reminders, and a Razorpay credit billing system.

---

## 🛠️ Complete Tech Stack

### 🎨 Frontend Stack
- **Framework & Runtime:** Next.js 16 (App Router) & React 19
- **Type System:** TypeScript 5.8
- **Styling:** Tailwind CSS 3.4
- **Authentication:** Clerk (`@clerk/nextjs`)
- **Rich Text Editor:** TipTap (`@tiptap/react`, `@tiptap/starter-kit`, Table, Image, Color, Highlight, Link, Subscript, Superscript, Character Count, Text Align, Font Family)
- **HTTP Client & Utilities:** Axios 1.9, Lucide React, DOMPurify, `date-fns`, `react-image-crop`, `react-markdown`, `remark-gfm`

### ⚡ Backend Stack
- **API Framework & Server:** FastAPI 0.111, Uvicorn (with `uvloop` & `httptools`), Starlette
- **Database & ORM:** PostgreSQL + `pgvector`, SQLAlchemy 2.0 (Async), `asyncpg`, Alembic 1.13
- **Cache & Rate Limiting:** Redis 5.0 (`redis.asyncio`), SlowAPI (with automatic in-memory fallback)
- **Security & Validation:** Pydantic 2.7, `pydantic-settings`, `python-jose` (RS256 Clerk JWKS + HS256), `bcrypt`, `bleach`, `python-magic`, Pillow
- **Payments & Email:** Razorpay SDK (`razorpay`), SendGrid (`sendgrid`)
- **Resilience & Async I/O:** `httpx` (pooled client), `tenacity`, `aiofiles`, custom async `CircuitBreaker`

### 🤖 AI, Speech-to-Text & Embeddings
- **Speech Transcription:** Groq Whisper (`whisper-large-v3-turbo`)
- **LLMs:** Groq (`openai/gpt-oss-120b` configurable via `GROQ_MODEL` / `GROQ_TASK_MODEL`) for summarization, Q&A, writing actions, and task extraction
- **Vector Embeddings (384-dim):** `BAAI/bge-small-en-v1.5` via Hugging Face Router Inference API (optional) with automatic fallback to local `fastembed`

---

## ✨ Core Features

- **Multi-Format Notes:** Rich text/markdown notes, voice notes with HTTP `206` byte-range audio streaming and Whisper transcription, and interactive JSONB checklists with AI task extraction.
- **Hybrid Semantic + Full-Text Search:** Combines `pgvector` HNSW cosine similarity with PostgreSQL GIN full-text search (`websearch_to_tsquery`) and per-user O(1) versioned Redis caching.
- **Document AI:** Background note enrichment (summary, tags, AI-extracted reminders), interactive per-note Q&A chat, and writing actions (rewrite, translate, tone, grammar, simplify, expand).
- **Real-Time Alerts:** Scheduled reminders delivered over authenticated WebSockets (`/alerts/ws`) with `FOR UPDATE SKIP LOCKED` polling.
- **Credits & Payments:** Atomic DB credit balance management (`credit_balance >= 0` check constraint) with Razorpay order creation (`Idempotency-Key` support), checkout verification, and authoritative server-to-server webhooks.

---

## 🏗️ System Design & Architecture

```mermaid
flowchart LR
    FE["Next.js 16 Frontend"] -->|HTTPS / Clerk JWT| MW["FastAPI Security Pipeline"]
    FE -->|WebSocket + JWT| WS["/alerts/ws Manager"]
    MW --> API["Routers (notes, search, audio, payments, alerts, users)"]
    API --> RES["Resilience Layer (Circuit Breakers, Retries, Pooled HTTPX)"]
    RES --> GROQ["Groq API (LLM & Whisper)"]
    RES --> HF["Hugging Face Router API"]
    HF -.->|Fallback on error / open circuit| FE_LOCAL["Local FastEmbed (CPU)"]
    API --> PG[("PostgreSQL + pgvector")]
    API --> REDIS[("Redis (Cache, Rate Limit, Sessions)")]
    API --> RZP["Razorpay Gateway"]
```

### 1. Middleware Security Pipeline (Execution Order)
Incoming HTTP requests pass through the following stack in [main.py](file:///work/Projects/Luminote/backend/app/main.py):
1. **CORSMiddleware** — Origin allowlist (`FRONTEND_URL` + localhost in non-prod) and exposed pagination/request-ID headers (`X-Next-Cursor`, `X-Has-More`, `X-Request-ID`).
2. **RequestLoggingMiddleware** — Assigns/propagates `X-Request-ID` via `ContextVar` ([observability.py](file:///work/Projects/Luminote/backend/app/observability.py)), records request counts and latency histograms, and logs without auth headers or body payloads.
3. **ConnectionThrottlingMiddleware** — Redis-backed 200 req/min/IP ceiling (gracefully skipped if Redis is unreachable).
4. **TimeoutMiddleware** — Global request timeout (`REQUEST_TIMEOUT_SECONDS`, default `30s`, returning `504`).
5. **SecurityHeadersMiddleware** — Sets `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Cache-Control: no-store` (or `public, max-age=86400` for `/media/`).
6. **RequestSizeLimitMiddleware** — ASGI-level body cap (`MAX_REQUEST_BODY_BYTES`, default `10MB`) enforced on both `Content-Length` and chunked/streaming bodies (`413`).
7. **HTTPSRedirectMiddleware** — Enabled automatically when `ENV=production`.

### 2. Database Design, Pooling & Indexing
- **Connection Pool ([database.py](file:///work/Projects/Luminote/backend/app/database.py)):** Async SQLAlchemy pool (`pool_size=10`, `max_overflow=20`, `pool_timeout=10s`, `pool_recycle=1800s`, `pool_pre_ping=True`) with `asyncpg` `command_timeout=15s`, `statement_timeout=15000ms`, `idle_in_transaction_session_timeout=30000ms`, and optional `DB_SSL_REQUIRE=true`.
- **Indexes:**
  - `notes`: HNSW vector index (`idx_notes_embedding_hnsw`), GIN FTS expression index (`idx_notes_fts` using `immutable_array_to_string`), GIN on `tags` and `checklist_items`, and composite keyset index `(user_id, is_pinned DESC, updated_at DESC)`.
  - `alerts`: Partial index `idx_alerts_pending_due` (`WHERE is_notified = false`) and `(user_id, alert_time ASC)`.
  - `credit_transactions`: Composite `(user_id, created_at DESC)` plus unique indexes on `razorpay_order_id` and `razorpay_payment_id`.
- **Least-Privilege Migrations:** Set `RUN_DB_MIGRATIONS=false` in production so the runtime app can use a DML-only DB role (`SELECT, INSERT, UPDATE, DELETE`), while schema changes are applied separately via `alembic upgrade head`.
- **Query Optimization & Pagination:** List queries (`get_notes`) defer `Note.embedding` to avoid transferring 384-float vectors; `GET /notes`, `GET /alerts`, and `GET /payments/history` support keyset cursor pagination (`limit`, `cursor`) via [pagination.py](file:///work/Projects/Luminote/backend/app/pagination.py).

### 3. Caching, Concurrency & Idempotency
- **Redis Resilience ([redis_client.py](file:///work/Projects/Luminote/backend/app/redis_client.py)):** Bounded pool (`max_connections=50`, `socket_timeout=3s`) with `redis_*_safe` wrappers and SlowAPI `in_memory_fallback_enabled=True` so Redis outages degrade gracefully instead of returning `500`.
- **O(1) Search Cache Invalidation:** Per-user `search_ver` counter is embedded in search cache keys and incremented on note/checklist/transcript mutations.
- **Payment & Credit Safety ([payments.py](file:///work/Projects/Luminote/backend/app/routers/payments.py), [credit_service.py](file:///work/Projects/Luminote/backend/app/services/credit_service.py)):**
  - Blocking Razorpay SDK calls run via `asyncio.to_thread` with timeout and `razorpay_breaker`.
  - `/payments/create-order` supports `Idempotency-Key` caching.
  - `/payments/verify` and `/payments/webhook` use an atomic conditional `UPDATE credit_transactions ... WHERE status = 'PENDING' RETURNING ...` so concurrent callbacks cannot double-credit a user.
  - AI endpoints (`/ask`, `/summarize`, `/ai-action`, `/extract-tasks`, `/transcribe`) verify credits upfront, close read transactions before external AI calls, and deduct credits atomically only after AI succeeds.

### 4. Observability & Audit Logging
- **Metrics (`GET /metrics`):** Exposes Prometheus text metrics (`http_requests_total`, `http_request_duration_ms`, `db_pool_checked_out`, `cache_hits_total`/`misses`, `circuit_breaker_state`), optionally protected by `METRICS_TOKEN`.
- **Health (`GET /health`):** Verifies PostgreSQL (`SELECT 1`) and Redis (`PING`), returning `503` if PostgreSQL is down.
- **Audit Trail:** Structured `luminote.audit` logs with CRLF sanitization for auth failures, account deletion, email/password changes, credit deductions, and payment lifecycle events.

---

## ⚠️ Known Issues & External API Notes

### Hugging Face Inference API (`HF_API_KEY`)
Luminote supports generating 384-dimensional `BAAI/bge-small-en-v1.5` embeddings via the Hugging Face Router Inference API (`https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5`) when `HF_API_KEY` is set.

- **Issue:** The remote Hugging Face Inference endpoint can experience model cold-starts, strict rate limits (`429`), transient `5xx`/`404`/`410` router errors, or token/permission failures.
- **Built-in Mitigation ([ai_service.py](file:///work/Projects/Luminote/backend/app/services/ai_service.py), [resilience.py](file:///work/Projects/Luminote/backend/app/services/resilience.py)):**
  - Calls are guarded by `hf_breaker` (`failure_threshold=3`, `recovery_timeout=60s`). Once open, requests fail fast without waiting on network timeouts.
  - On any HF error, open circuit, or empty `HF_API_KEY`, `get_embedding()` **automatically falls back to local CPU inference via `fastembed`** (`BAAI/bge-small-en-v1.5`, pre-cached in the Docker image).
- **Recommended Configuration:** Leave `HF_API_KEY=` empty in local or self-hosted deployments to use local `fastembed` directly with predictable latency and zero external API quota failures.

---

## 📂 Repository Structure

```text
Luminote/
├── .github/
│   ├── dependabot.yml             # Weekly pip, npm, and Docker dependency updates
│   └── workflows/ci.yml           # Unit tests, pip-audit, and Trivy container scan
├── backend/
│   ├── alembic/                   # Alembic migration environment & revisions
│   ├── alembic.ini
│   ├── app/
│   │   ├── auth/                  # Clerk RS256 JWKS verification & user sync
│   │   ├── models/                # SQLAlchemy models (User, Note, Alert, CreditTransaction)
│   │   ├── routers/               # FastAPI routers (auth, users, notes, search, alerts, audio, checklist, tasks, payments)
│   │   ├── schemas/               # Bounded & sanitized Pydantic schemas
│   │   ├── services/              # Business logic, resilience/circuit breakers, file security, maintenance
│   │   ├── config.py              # Pydantic Settings & production secret checks
│   │   ├── database.py            # Async engine, pool metrics, timeouts, init_db
│   │   ├── groq_client.py         # Shared AsyncGroq client
│   │   ├── limiter.py             # SlowAPI limiter with Redis + in-memory fallback
│   │   ├── main.py                # FastAPI app, security middleware, WebSocket alerts, /health, /metrics
│   │   ├── observability.py       # Request ID filter, JSON logging, audit_log, Prometheus metrics
│   │   ├── pagination.py          # Shared keyset cursor & header helpers
│   │   └── redis_client.py        # Bounded Redis pool & safe degradation wrappers
│   ├── tests/                     # Security, resilience, and concurrency unit tests
│   ├── Dockerfile                 # Multi-stage non-root image with pre-cached fastembed model
│   ├── requirements.in
│   ├── requirements.txt           # Hash-pinned Python dependencies
│   └── .env.example
├── frontend/
│   ├── app/                       # Next.js App Router pages
│   ├── components/                # UI components (AudioRecorder, NoteCard, AIPanel, etc.)
│   ├── hooks/
│   ├── lib/                       # Axios API client & Clerk token interceptor
│   ├── types/
│   ├── Dockerfile
│   ├── package.json
│   └── .env.local.example
└── README.md
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **PostgreSQL 15+** with the **`pgvector`** extension installed
- **Redis 5+** (or Valkey)
- **Python 3.12+** and **Node.js 20+ / pnpm 9+**

### 2. Environment Setup

#### Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env` and configure:
```env
ENV=development
LOG_LEVEL=INFO
LOG_FORMAT=text

DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/luminote
RUN_DB_MIGRATIONS=true
DB_SSL_REQUIRE=false
REDIS_URL=redis://localhost:6379

CLERK_SECRET_KEY=sk_test_your_key_here
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
GROQ_API_KEY=gsk_your_key_here
HF_API_KEY=

JWT_SECRET=replace-with-strong-64-char-secret-in-production
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```
> **Production notes:** Set `ENV=production`, provide a strong `JWT_SECRET` (startup fails if empty in production), enable `DB_SSL_REQUIRE=true` / `rediss://`, and optionally set `RUN_DB_MIGRATIONS=false` after running `alembic upgrade head` with a migration role.

#### Frontend (`frontend/.env.local`)
Copy `frontend/.env.local.example` to `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### 3. Running Locally

#### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --require-hashes --only-binary :all: -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Frontend
```bash
cd frontend
pnpm install
pnpm run dev
```

- **Frontend:** http://localhost:3000
- **Swagger API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health
- **Prometheus Metrics:** http://localhost:8000/metrics

### 4. Tests, Migrations & Maintenance
```bash
cd backend

# Run unit, security, and concurrency tests
python -m unittest discover -s tests -v

# Apply Alembic migrations (or preview SQL with --sql)
alembic upgrade head

# Purge old notified alerts (>90d) & abandoned pending orders (>30d) + ANALYZE
python -m app.services.maintenance
```

---

## 📑 Core API Endpoints

### 📝 Notes & AI (`/notes`)
- `GET /notes` — List notes (supports `tag`, `note_type`, `is_favorite`, `is_pinned`, `limit`, `cursor`)
- `POST /notes` — Create a note (triggers background AI enrichment)
- `GET /notes/{note_id}` — Fetch single note
- `PUT /notes/{note_id}` — Update note
- `DELETE /notes/{note_id}` — Delete note
- `POST /notes/{note_id}/summarize` — Generate AI summary & extract calendar alerts (5 credits)
- `POST /notes/{note_id}/ask` — Document Q&A chat with row-locked history (2 credits)
- `POST /notes/{note_id}/ai-action` — Writing actions: `rewrite`, `translate`, `tone`, `grammar`, `simplify`, `expand` (3 credits)
- `POST /notes/upload-image` — Upload validated image (`PNG`/`JPEG`/`WEBP`, max 10MB)

### 🎤 Audio & Checklists
- `POST /notes/{note_id}/audio` — Upload audio recording (magic-byte validated, max 10MB)
- `POST /notes/{note_id}/transcribe` — Transcribe saved audio via Groq Whisper (10 credits, charged only on success)
- `PATCH /notes/{note_id}/checklist/{item_index}` — Toggle checklist item via targeted JSONB `jsonb_set`
- `POST /notes/{note_id}/extract-tasks` — Extract actionable tasks via Groq AI (3 credits)

### 🔍 Search & Alerts
- `POST /search` — Hybrid `pgvector` HNSW + GIN FTS search (cached per user version)
- `GET /alerts`, `POST /alerts`, `DELETE /alerts/{alert_id}`, `DELETE /alerts`, `PATCH /alerts/{alert_id}/notified`
- `WS /alerts/ws?token=...` — Real-time alert delivery channel

### 🔐 Auth, Users & Payments
- `GET /users/me`, `POST /users/me/avatar`, `DELETE /users/me/avatar`
- `PATCH /users/me/email`, `GET /users/verify-email`, `PATCH /users/me/password`, `PATCH /users/me/name`, `DELETE /users/me`
- `DELETE /auth/account` — Delete account and clean up sessions/media
- `GET /payments/packages`, `POST /payments/create-order`, `POST /payments/verify`, `POST /payments/webhook`, `GET /payments/history`
- `GET /health`, `GET /metrics`
