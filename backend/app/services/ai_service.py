import hashlib
import json
import logging
from typing import Optional

from groq import AsyncGroq
from openai import AsyncOpenAI

from app.config import settings
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

_groq_client: Optional[AsyncGroq] = None
_openai_client: Optional[AsyncOpenAI] = None


def _groq() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


def _openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


async def get_ai_enrichment(content: str) -> dict:
    """
    Full AI pipeline:
    1. MD5 hash the content
    2. Check Redis cache at ai_response:{hash}
    3. On miss: call Groq for summary + tags
    4. Return { summary, tags }
    Result is cached for 7 days.
    """
    content_hash = _md5(content)
    cache_key = f"ai_response:{content_hash}"

    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        logger.info("AI cache HIT for hash %s", content_hash)
        return json.loads(cached)

    logger.info("AI cache MISS for hash %s — calling Groq", content_hash)

    prompt = f"""Analyze the following note content and return a JSON object with exactly two fields:
- "summary": a concise 1-3 sentence summary of the note
- "tags": an array of 3-7 relevant keyword tags (single words or short phrases, lowercase)

Respond with ONLY valid JSON, no markdown, no explanation.

Note content:
{content[:4000]}"""

    try:
        response = await _groq().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        if "summary" not in result:
            result["summary"] = ""
        if "tags" not in result:
            result["tags"] = []

    except Exception as e:
        logger.error("Groq API error: %s", e)
        result = {"summary": "", "tags": []}

    # Cache the result
    await redis.setex(cache_key, settings.ai_cache_ttl, json.dumps(result))
    return result


async def get_embedding(text: str) -> list[float]:
    """
    Generate a 1536-dimensional embedding using OpenAI text-embedding-3-small.
    """
    try:
        response = await _openai().embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error("OpenAI embedding error: %s", e)
        return []


async def get_search_embedding_cached(query: str) -> tuple[list[float], bool]:
    """
    Get embedding for a search query.
    Caches the *embedding* itself isn't cached, but search results are cached
    upstream in the search router.
    """
    embedding = await get_embedding(query)
    return embedding, False


async def ask_question(content: str, question: str) -> str:
    """
    Send note content + question to Groq and return the answer.
    """
    prompt = f"""You are a helpful assistant. The user has a note with the following content:

---
{content[:6000]}
---

Answer the following question based on the note content:
{question}

Be concise and accurate. If the answer cannot be found in the note, say so."""

    try:
        response = await _groq().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=1024,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Groq Q&A error: %s", e)
        return "Sorry, I could not generate an answer at this time."
