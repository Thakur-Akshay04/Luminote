# 🌌 Luminote

> **Next-Generation AI Workspace, Interactive Thought Map & Multimodal Knowledge Base**

Luminote is an intelligent markdown workspace that connects your notes, checklists, vector drawings, and voice recordings using a fullscreen, interactive thought map powered by customized spring-drift physics, `pgvector` semantic search, Groq Whisper audio transcription, and document-level AI Q&A.

---

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.9-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.110.0-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-Cache-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

---

## ✨ Key Features

### 🧠 Interactive Thought Map Sandbox
- **Spring-Drift Physics Engine:** Real-time node network simulation with custom tension, repulsion, and damping physics.
- **Orbital Synapse Hub Rings & Data Packets:** Dynamic visual connections featuring animated glowing data-flow particles traversing link tracks.
- **Cursor Magnet Attraction & Radar Pings:** Interactive cursor fields that pull nearby node clusters with radar ping visual feedback.

### 🎙️ Voice Note Studio
- **Context-Aware Studio Deck:** Sleek dark glass recording interface with real-time soundwave equalizer visualization.
- **Precision Audio Player:** Custom scrubber bar with play/pause micro-animations, variable playback speed (`1.0x` – `2.0x`), and volume controls.
- **Groq Whisper AI Transcription:** High-speed speech-to-text audio transcription stored directly inside your note database record.

### 🎨 Integrated Vector Sketchpad
- **Freehand Canvas Drawing:** Draw diagrams, mind maps, or wireframes directly alongside text content using an embedded vector canvas.
- **Multi-Version History:** Save, retrieve, and switch between drawing versions directly within the document view.

### 📋 Checklist Planner & AI Task Generator
- **Interactive Checklists:** Track task completion with real-time progress indicators.
- **AI Task Extraction:** Paste unstructured context or meeting notes to automatically extract actionable checklist items using LLM parsing.

### 🔍 Semantic Vector Search & AI Document Q&A
- **`pgvector` Embedding Search:** Perform vector-based semantic search across your entire workspace.
- **Document Q&A & Summarization:** Chat directly with specific notes or extract key milestones and executive summaries on demand.

### 📅 Calendar & Milestone Synchronization
- **Timeline Overview:** Unified calendar board linking note creations, task deadlines, and project milestones.

---

## 🛠️ Tech Stack

| Category | Technology | Usage |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 16.2.9** (Turbopack) | App Router Single-Page Interface & Server Rendering |
| **Frontend Language** | **TypeScript** | Type-safe React components and custom hooks |
| **Styling & UI** | **Tailwind CSS** & **Lucide Icons** | Glassmorphic dark design system & micro-interactions |
| **Backend Framework** | **FastAPI** | High-performance asynchronous REST API backend |
| **Database** | **PostgreSQL** with **`pgvector`** | Relational data persistence & vector similarity search |
| **Caching** | **Redis** | Session management, caching, and rate limiting |
| **AI Transcription** | **Groq Whisper API** | High-speed speech-to-text audio transcription |
| **AI Embeddings & LLM** | **OpenAI** / **Groq Llama 3** | Vector embeddings (`text-embedding-3-small`) & document Q&A |
| **Package Managers** | **pnpm** (Frontend) / **uv** (Backend) | Ultra-fast dependency resolution and virtual environments |

---

## 📁 Repository Structure

```
Luminote/
├── backend/                  # FastAPI Python Backend
│   ├── app/
│   │   ├── auth/             # Authentication & Clerk JWT handling
│   │   ├── models/           # SQLAlchemy DB models (Note, Audio, Drawing, Vector)
│   │   ├── routes/           # REST API Route Endpoints
│   │   ├── services/         # AI, Transcription & Embedding Services
│   │   └── main.py           # FastAPI Application Entrypoint
│   ├── requirements.txt      # Python Dependencies
│   └── Dockerfile
│
├── frontend/                 # Next.js Frontend Workspace
│   ├── app/                  # Next.js App Router Pages (/notes, /dashboard, /calendar)
│   ├── components/           # React Components (AudioRecorder, ThoughtMap, Canvas)
│   ├── lib/                  # API Client Services & Axios Configuration
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml        # Docker Multi-Container Orchestration
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18.0+) & **pnpm**
- **Python** (v3.11+)
- **Docker** & **Docker Compose** (optional, recommended for full stack)

---

### Option 1: Docker Compose (Recommended)

Spin up PostgreSQL, Redis, Backend, and Frontend services with a single command:

```bash
docker-compose up --build
```

- 🌐 **Frontend App:** `http://localhost:3000`
- ⚙️ **Backend API Documentation:** `http://localhost:8000/docs`

---

### Option 2: Local Development Setup

#### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create & activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Start FastAPI development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install

# Configure environment variables
cp .env.local.example .env.local

# Start Next.js development server
pnpm run dev
```

---

## 🔑 Environment Configuration

### Backend `.env`

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=luminote
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

REDIS_URL=redis://localhost:6379

GROQ_API_KEY=your_groq_api_key
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret_key
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

---

## 📡 REST API Reference

### 🔐 Authentication (`/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Register a new user account |
| `POST` | `/auth/login` | Authenticate user credentials and return JWT bearer token |
| `PUT` | `/auth/password` | Update current user password |
| `DELETE` | `/auth/account` | Permanently delete user account |

### 📝 Notes Management (`/notes`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/notes` | List user notes (supports `type`, `favorite`, and `tag` query filters) |
| `POST` | `/notes` | Create a new note (text, audio, drawing, or checklist) |
| `GET` | `/notes/{id}` | Fetch full details for a specific note |
| `PUT` | `/notes/{id}` | Update note title, content, or tags |
| `DELETE` | `/notes/{id}` | Delete a note |

### 🎨 Freehand Canvas (`/notes/{id}/drawing`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/notes/{id}/drawing` | Save new vector drawing canvas version |
| `GET` | `/notes/{id}/drawing` | Retrieve drawing version history |
| `POST` | `/notes/{id}/drawing/switch` | Switch active drawing to specified version |
| `DELETE` | `/notes/{id}/drawing/version/{v}` | Delete a specific drawing version |

### 🎤 Voice Recording & AI Speech-to-Text (`/notes/{id}/audio`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/notes/{id}/audio` | Upload binary audio recording file |
| `POST` | `/notes/{id}/transcribe` | Transcribe audio recording via Groq Whisper API |

### 🧠 Semantic Search & AI Copilot (`/search` & `/notes/{id}`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/search` | Vector similarity search across notes via `pgvector` |
| `POST` | `/notes/{id}/ask` | Interactive Q&A chat on document content |
| `POST` | `/notes/{id}/summarize` | AI-generated executive summary & milestones |
| `POST` | `/notes/{id}/extract-tasks` | Parse unstructured text into checklist items |

---

## 🛡️ Security & Accessibility Standard

- **Keyboard Accessibility:** Complete keyboard navigation for note selection, popover dialogs, and custom media players using standard ARIA roles (`role="menu"`, `role="region"`).
- **Cryptographic Security:** Node physics velocity initialization and layout jitter utilize browser-native cryptographic random generators (`window.crypto.getRandomValues`).
- **Data Protection:** Password hashing using bcrypt/argon2 standards with JWT stateless authentication options.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
