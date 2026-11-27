# Luminote

Luminote is a secure, lightweight, AI-powered note-taking and knowledge management workspace. It combines rich TipTap editing, voice note recording with Groq Whisper transcription, interactive checklists, hybrid semantic + full-text search, a visual Thought Map, and real-time WebSocket reminders.

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
- **Email & Async I/O:** SendGrid (`sendgrid`), `httpx` (pooled client), `tenacity`, `aiofiles`, custom async `CircuitBreaker`

### 🤖 AI, Speech-to-Text & Embeddings
- **Speech Transcription:** Groq Whisper (`whisper-large-v3-turbo`)
- **LLMs:** Groq (`openai/gpt-oss-120b` configurable via `GROQ_MODEL` / `GROQ_TASK_MODEL`) for summarization, Q&A, writing actions, and task extraction
- **Vector Embeddings (384-dim):** `BAAI/bge-small-en-v1.5` via Hugging Face Router Inference API (optional) with automatic fallback to local `fastembed`

---

## ✨ Core Features

- **Multi-Format Notes:** Rich text/markdown notes, voice notes with HTTP `206` byte-range audio streaming and Whisper transcription, and interactive checklists with AI task extraction.
- **Interactive Thought Map:** Visual node graph mapping connections across notes with filtering by note type, title search, and tags.
- **Hybrid Semantic + Full-Text Search:** Combines `pgvector` HNSW cosine similarity with PostgreSQL GIN full-text search (`websearch_to_tsquery`) and per-user versioned Redis caching.
- **Document AI:** Background note enrichment (summary, tags, AI-extracted reminders), interactive per-note Q&A chat, and writing actions (rewrite, translate, tone, grammar, simplify, expand).
- **Real-Time Alerts:** Scheduled reminders delivered over authenticated WebSockets (`/alerts/ws`).
- **Authentication & Profile Management:** Clerk JWT authentication, avatar uploads, email verification, password updates, and account deletion.

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
│   │   ├── models/                # SQLAlchemy ORM models
│   │   ├── routers/               # FastAPI endpoint routers
│   │   ├── schemas/               # Bounded & sanitized Pydantic schemas
│   │   ├── services/              # Business logic, circuit breakers, file security, maintenance
│   │   ├── config.py              # Pydantic Settings & environment validation
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
- **PostgreSQL 15+** with **`pgvector` >= 0.8.0** (required for `hnsw.iterative_scan` on per-user filtered semantic search)
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

# Purge old notified alerts (>90d) & refresh table statistics
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
- `POST /notes/{note_id}/summarize` — Generate AI summary & extract calendar alerts
- `POST /notes/{note_id}/ask` — Document Q&A chat
- `POST /notes/{note_id}/ai-action` — Writing actions (`rewrite`, `translate`, `tone`, `grammar`, `simplify`, `expand`)
- `POST /notes/upload-image` — Upload validated image (`PNG`/`JPEG`/`WEBP`, max 10MB)

### 🎤 Audio & Checklists
- `POST /notes/{note_id}/audio` — Upload audio recording (magic-byte validated, max 10MB)
- `POST /notes/{note_id}/transcribe` — Transcribe saved audio via Groq Whisper
- `PATCH /notes/{note_id}/checklist/{item_index}` — Toggle checklist item
- `POST /notes/{note_id}/extract-tasks` — Extract actionable tasks via Groq AI

### 🔍 Search, Alerts & Account
- `POST /search` — Hybrid `pgvector` HNSW + GIN FTS search
- `GET /alerts`, `POST /alerts`, `DELETE /alerts/{alert_id}`, `DELETE /alerts`, `PATCH /alerts/{alert_id}/notified`
- `WS /alerts/ws?token=...` — Real-time alert delivery channel
- `GET /users/me`, `POST /users/me/avatar`, `DELETE /users/me/avatar`, `PATCH /users/me/email`, `GET /users/verify-email`, `PATCH /users/me/password`, `PATCH /users/me/name`, `DELETE /users/me`
- `DELETE /auth/account` — Delete account and clean up sessions/media
- `GET /health`, `GET /metrics`
