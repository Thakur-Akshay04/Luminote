# Notiq — AI-Powered Notes

Full-stack notes application with AI summarization, semantic search, and Q&A.

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI
- **Database**: PostgreSQL + pgvector
- **Cache**: Redis
- **LLM**: Groq (llama-3.3-70b-versatile)
- **Embeddings**: OpenAI text-embedding-3-small

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
# Luminote
"# Luminote" 
