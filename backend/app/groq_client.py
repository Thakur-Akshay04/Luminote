from groq import AsyncGroq

from app.config import settings

# Single shared Groq client instance; retries & circuit breaking are managed by resilience.py
GROQ_API_KEY = settings.groq_api_key
MODEL = settings.groq_task_model

client = AsyncGroq(
    api_key=GROQ_API_KEY,
    timeout=20.0,
    max_retries=0,
)
