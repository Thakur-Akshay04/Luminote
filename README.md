# Luminote — Smart Collaborative Workspace

Luminote is a high-fidelity, collaborative markdown workspace that connects your notes, tasks, drawings, and audio recordings using a fullscreen, interactive thought map powered by customized spring physics and advanced AI summarization, semantic search, and document Q&A.

![Workspace Sandbox Overview](https://img.shields.io/badge/Luminote-Workspace-blueviolet?style=for-the-badge)

---

## 🚀 Key Features

* **Interactive Thought Map Sandbox:** An obsidian glass node network graph visualizer simulating spring-drift physics. Includes cursor magnet attraction, orbital spinning Synapse hub rings, radar pings on node hover, permanent node tags, and animated dual-packet glowing data flow lines traversing connection tracks.
* **Smart Auth Blending:** Beautifully blends login and registration pages using high-transparency glassmorphic containers (`bg-[#0c0c0e]/10` with `backdrop-blur-md`), user profile **Name** metadata registration database mapping, password strength check meters, and password show/hide eye toggles.
* **Markdown Note Editor:** Dynamic note-taking environment supporting direct markdown rendering.
* **Canvas Sketching:** Integrated freehand vector canvas sketchpad inside note documents to draw diagrams or sketch layouts directly alongside text.
* **Voice Captures:** Audio recorder with instant browser voice captures and backend-supported speech transcription.
* **Sprint Tracks:** Interactive checkbox checklists inside note blocks with automatic timeline synchronization.
* **Calendar Sync:** Complete planning overview board linking checklists, note updates, and milestone deadlines.
* **AI Copilot & Agents:** Perform document-level Q&A, extract tasks lists, and execute real-time document summaries.

---

## 🛠️ Tech Stack

* **Frontend:**
  - ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white) 16.2.9 (Turbopack)
  - ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
  - ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
* **Backend:**
  - ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
  - ![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
* **Database & Cache:**
  - ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) with `pgvector` extension
  - ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
* **AI & Embeddings:**
  - ![Groq](https://img.shields.io/badge/Groq-orange?style=flat-square) (Llama 3 70B / Qwen 72B)
  - ![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white) (text-embedding-3-small)

---

## 📦 Quick Start

### 1. Configure Environment Variables

Create your local environment files and add your API keys:

```bash
# Copy backend env
cp backend/.env.example backend/.env
# Fill in required variables: GROQ_API_KEY, OPENAI_API_KEY, JWT_SECRET

# Copy frontend env
cp frontend/.env.local.example frontend/.env.local
```

### 2. Run with Docker Compose (Recommended)

Spins up the database, cache, backend server, and frontend web server instantly:

```bash
docker-compose up --build
```

* **Frontend Workspace:** http://localhost:3000
* **Backend API Docs:** http://localhost:8000/docs

### 3. Run Locally (Without Docker)

**Backend Server Setup**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend Server Setup**
```bash
cd frontend
pnpm install
pnpm run dev
```

---

## 📑 API Routes Specification

### 🔐 Authentication
* `POST /auth/register` — Register a new account (`email`, `password`, `name`).
* `POST /auth/login` — Login user credentials and return jwt bearer token.
* `PUT /auth/password` — Update user account password.
* `DELETE /auth/account` — Delete user account.

### 📝 Notes Management
* `GET /notes` — List user notes (supports tag and type filter params).
* `POST /notes` — Create a new note structure.
* `GET /notes/{id}` — Fetch details for a specific note.
* `PUT /notes/{id}` — Update note title, content, or tags.
* `DELETE /notes/{id}` — Delete a note.

### 🎨 Freehand Canvas Drawing
* `POST /notes/{id}/drawing` — Save canvas vector image content (Base64).
* `GET /notes/{id}/drawing` — Fetch drawing content versions.
* `POST /notes/{id}/drawing/switch` — Switch drawing to a specified version.
* `DELETE /notes/{id}/drawing/version/{version}` — Delete a specific drawing version.

### 🎤 Voice Recording & Transcribing
* `POST /notes/{id}/audio` — Upload audio recording binary file.
* `POST /notes/{id}/transcribe` — Process audio transcription using speech-to-text.

### 📋 Checklists & To-dos
* `PATCH /notes/{id}/checklist/{index}` — Toggle checklist item status (checked state).
* `POST /notes/{id}/extract-tasks` — Extract checklists task lists using LLM parsing.

### 🧠 Semantic Search & AI Q&A
* `POST /search` — Perform vector-based semantic search.
* `POST /notes/{id}/ask` — Q&A document interaction chat.
* `POST /notes/{id}/summarize` — AI-powered note summarization with key milestones.

---

## 🔒 Security Compliance

* **Cryptographic Randomness:** Node velocities and layout jitter logic are calculated using browser-native cryptographically secure random generators (`window.crypto.getRandomValues`) to ensure robust random outputs.
* **Salted Hashes:** User password storage leverages secure hashing algorithms inside the database service layers.
