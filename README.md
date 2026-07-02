# Luminote — AI-Powered Notes

Full-stack notes application with AI summarization, semantic search, and Q&A.

## 🛠️ Tech Stack

- **Frontend**: ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
- **Backend**: ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white) ![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
- **Database**: ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) + `pgvector`
- **Cache**: ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
- **LLM**: ![Groq](https://img.shields.io/badge/Groq-orange?style=flat-square) (llama-3.3-70b-versatile)
- **Embeddings**: ![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white) (text-embedding-3-small)

## Quick Start

### 1. Configure environment variables

```bash
# Copy backend env
cp backend/.env.example backend/.env
# Fill in your API keys: GROQ_API_KEY, OPENAI_API_KEY, JWT_SECRET

# Copy frontend env
cp frontend/.env.local.example frontend/.env.local
```

### 2. Run with Docker Compose (recommended)

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 3. Run locally (without Docker)

**Backend**
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | /auth/register | Register a new user |
| POST | /auth/login | Login and get JWT |
| GET | /notes | List user notes |
| POST | /notes | Create a note |
| GET | /notes/{id} | Get a single note |
| PUT | /notes/{id} | Update a note |
| DELETE | /notes/{id} | Delete a note |
| POST | /search | Semantic search |
| POST | /notes/{id}/ask | Q&A on a note |

## Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| GROQ_API_KEY | Groq API key |
| OPENAI_API_KEY | OpenAI API key (for embeddings) |
| JWT_SECRET | Secret key for JWT signing |
