# Luminote

Luminote is a modern, high-performance note-taking and knowledge management workspace. It combines rich markdown editing, freehand vector canvas sketching, voice note recording with AI speech-to-text transcription, interactive checklists, and a visual Thought Map network graph powered by FastAPI, Next.js, and AI.

---

## 🛠️ Complete Tech Stack

### 🎨 Frontend Stack
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk_Auth-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

- **Framework & Runtime:** Next.js 16 (App Router, Turbopack) & React 19 / React DOM 19
- **Type System:** TypeScript 5.8
- **Authentication:** Clerk Auth (`@clerk/nextjs`)
- **Rich Text Editor:** TipTap Editor Ecosystem (`@tiptap/react`, `@tiptap/starter-kit`, Table, Image, Color, Highlight, Link, Subscript, Superscript, Character Count, Text Align, Font Family)
- **Vector Canvas Sketchpad:** Fabric.js (`fabric` 7.4.0)
- **HTTP Client:** Axios (`axios` 1.9.0)
- **Icons & UI Utilities:** Lucide React (`lucide-react`), `clsx`, DOMPurify (`dompurify`), `date-fns`, `js-cookie`, `react-image-crop`, `react-markdown`, `remark-gfm`

---

### ⚡ Backend Stack
![FastAPI](https://img.shields.io/badge/FastAPI_0.111-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Uvicorn](https://img.shields.io/badge/Uvicorn-4998F8?style=for-the-badge&logo=gunicorn&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis_5.0-DC382D?style=for-the-badge&logo=redis&logoColor=white)

- **API Framework & Server:** FastAPI 0.111, Uvicorn (standard with `httptools` & `uvloop`), Starlette
- **Database & ORM:** PostgreSQL, SQLAlchemy 2.0 (Async Engine), `asyncpg` (async PostgreSQL driver), `pgvector` (Vector database extension), Alembic (Database schema migrations)
- **Cache & In-Memory Store:** Redis 5.0 (`redis-py` async client)
- **Rate Limiting & Security:** SlowAPI, Pydantic 2.7, Pydantic-Settings, PyJWT / Python-Jose, Cryptography, Passlib (Bcrypt), Python-Multipart
- **Async I/O & Utilities:** `aiofiles` (async file I/O & static byte-range audio streaming), Pillow (Image processing), Bleach (HTML sanitization), Tenacity (Async retries & exponential backoff), SendGrid (`sendgrid`)

---

### 🤖 AI, Speech-to-Text & Embeddings
![Groq](https://img.shields.io/badge/Groq_SDK-F56565?style=for-the-badge&logo=cpu&logoColor=white)
![Whisper](https://img.shields.io/badge/Groq_Whisper_v3-00A67E?style=for-the-badge&logo=openai&logoColor=white)
![FastEmbed](https://img.shields.io/badge/FastEmbed-412991?style=for-the-badge&logo=brain&logoColor=white)

- **Speech Transcription:** Groq API (`whisper-large-v3-turbo`)
- **Document AI & LLMs:** Groq API (`qwen/qwen3.6-27b` / Llama 3 70B) for document Q&A, note summarization, and AI task extraction
- **Vector Embeddings:** FastEmbed (`fastembed`) & `pgvector` for semantic vector search across notes and transcripts

---

## ✨ Core Features

### 📝 Multi-Format Note Workspace
- **Markdown Text Editor:** Rich text and markdown document editing powered by TipTap with real-time formatting tools and clean typography.
- **Vector Canvas Sketchpad:** Freehand drawing canvas inside notes powered by Fabric.js with multi-version history tracking (save, switch versions, and delete historical sketches).
- **Voice Note Studio:** In-browser audio recording with real-time soundwave visualization, custom HTML5 audio playback deck (scrubber, `1x-2x` speed control, volume toggle), and AI speech-to-text transcription powered by **Groq Whisper** (`whisper-large-v3-turbo`).
- **Checklist Planner:** Interactive checkbox lists with AI task extraction that automatically parses meeting notes or context paragraphs into actionable tasks using **Groq LLMs**.

### 🕸️ Interactive Thought Map
- Fullscreen interactive node graph visualizer mapping connections between your notes.
- Filter node network by note type (Text, Drawing, Audio, Checklist), search by title, or filter by custom tags.
- Clickable nodes with smooth zoom, pan, and direct note navigation.

### 🧠 Semantic Search & Document AI
- **Semantic Vector Search:** High-speed vector search across titles, markdown content, audio transcripts, and drawing metadata powered by **FastEmbed** and **pgvector**.
- **AI Document Summarization:** Generate instant key insights and summaries from your notes.
- **Document Q&A:** Interactive Q&A chat grounded directly on a specific note's content.

### 🔔 Real-Time Alerts & Reminders
- Schedule time-based reminders and alerts linked to specific notes.
- Real-time notification delivery powered by **FastAPI WebSockets** (`/ws/alerts`).

### 🔐 Authentication & Account Management
- Secure user authentication powered by **Clerk** (`@clerk/nextjs` on the frontend and Clerk JWT JWKS verification on FastAPI).
- User profile management and account deletion options.

---

## 📂 Repository Structure

```
Luminote/
├── backend/
│   ├── app/
│   │   ├── auth/            # Clerk JWT authentication verification
│   │   ├── models/          # SQLAlchemy DB models (Note, Alert, User)
│   │   ├── routers/         # FastAPI endpoint routers (notes, audio, drawing, search, alerts, tasks)
│   │   ├── schemas/         # Pydantic data validation schemas
│   │   ├── services/        # Business logic & AI processing services
│   │   ├── config.py        # Environment settings & AI model configurations
│   │   ├── database.py      # SQLAlchemy async DB session initialization
│   │   ├── groq_client.py   # Groq API client helper
│   │   ├── redis_client.py  # Async Redis client for caching
│   │   └── main.py          # FastAPI application entrypoint & WebSockets manager
│   ├── uploads/             # Audio recordings & binary storage
│   ├── requirements.txt     # Python backend dependencies (autogenerated)
│   ├── requirements.in      # Primary backend requirement declarations
│   └── .env.example         # Backend environment variables template
├── frontend/
│   ├── app/
│   │   ├── sign-in/         # Clerk Sign-in page
│   │   ├── sign-up/         # Clerk Sign-up page
│   │   ├── notes/           # Note view & editor workspace pages
│   │   ├── dashboard/       # Workspace dashboard overview
│   │   ├── search/          # Semantic search page
│   │   └── layout.tsx       # Root layout with Clerk Provider
│   ├── components/          # Reusable UI components (AudioRecorder, Canvas, Checklist, etc.)
│   ├── lib/                 # API client services & utility helpers
│   ├── package.json         # Frontend dependencies & scripts
│   └── .env.local.example   # Frontend environment variables template
└── README.md
```

---

## 🚀 Quick Start

### 1. Environment Setup

#### Backend Configuration (`backend/.env`)
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/luminote_db
REDIS_URL=redis://localhost:6379

GROQ_API_KEY=your_groq_api_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json

FRONTEND_URL=http://localhost:3000
```

#### Frontend Configuration (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
```

---

### 2. Running Locally

#### Start PostgreSQL & Redis
Ensure PostgreSQL and Redis services are running on your system.

#### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Frontend Setup
```bash
cd frontend
pnpm install
pnpm run dev
```

- **Frontend App:** [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📑 Core API Endpoints

### 📝 Notes (`/notes`)
- `GET /notes` — List user notes (supports `tag` and `note_type` filters)
- `POST /notes` — Create a new note
- `GET /notes/{id}` — Get note details
- `PUT /notes/{id}` — Update note title, content, or tags
- `DELETE /notes/{id}` — Delete a note
- `POST /notes/{id}/summarize` — Generate AI summary of a note
- `POST /notes/{id}/ask` — Q&A chat against a note's content

### 🎤 Audio & Speech (`/notes/{id}`)
- `POST /notes/{id}/audio` — Upload audio recording file
- `POST /notes/{id}/transcribe` — Transcribe audio using Groq Whisper

### 🎨 Drawing Canvas (`/notes/{id}/drawing`)
- `POST /notes/{id}/drawing` — Save canvas drawing version
- `GET /notes/{id}/drawing` — Fetch drawing versions
- `POST /notes/{id}/drawing/switch` — Switch active drawing version
- `DELETE /notes/{id}/drawing/version/{version}` — Delete a drawing version

### 📋 Checklists & Tasks
- `PATCH /notes/{id}/checklist/{index}` — Toggle checklist item completion
- `POST /notes/{id}/extract-tasks` — Extract checklist tasks from context using Groq AI
- `GET /tasks` — List user tasks

### 🔍 Search & Alerts
- `POST /search` — Semantic vector search across notes and transcripts
- `GET /alerts` & `POST /alerts` — Manage scheduled note alerts
- `WS /ws/alerts` — Real-time WebSocket alerts channel

### 🔐 Auth & User (`/auth`, `/users`)
- `GET /users/me` — Fetch current user profile
- `DELETE /auth/account` — Delete user account
