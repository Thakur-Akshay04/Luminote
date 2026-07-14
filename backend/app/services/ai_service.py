import hashlib
import json
import logging
from typing import Optional

import httpx

from app.config import settings
from app.redis_client import get_redis
from app.groq_client import client, MODEL

logger = logging.getLogger(__name__)


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def _extract_json_content(raw: str) -> str:
    raw = raw.strip()
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if (part.startswith("{") and part.endswith("}")) or (part.startswith("[") and part.endswith("]")):
                return part
    start_idx = raw.find("{")
    end_idx = raw.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        return raw[start_idx : end_idx + 1]
    return raw


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
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=512,
        )
        raw = (response.choices[0].message.content or "").strip()
        json_str = _extract_json_content(raw)
        result = json.loads(json_str)
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
    Generate a 384-dimensional embedding using BAAI/bge-small-en-v1.5 via Hugging Face Serverless API.
    """
    try:
        api_url = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5"
        headers = {}
        if getattr(settings, "hf_api_key", None):
            headers["Authorization"] = f"Bearer {settings.hf_api_key}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                api_url,
                headers=headers,
                json={"inputs": text[:8000]},
                timeout=15.0
            )
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    # Hugging Face feature extraction can return flat list [...] or nested list [[...]]
                    if isinstance(result[0], list):
                        return [float(x) for x in result[0]]
                    return [float(x) for x in result]
            logger.error("Hugging Face API returned status code %s: %s", response.status_code, response.text)
            return []
    except Exception as e:
        logger.error("Hugging Face embedding error: %s", e)
        return []


async def get_search_embedding_cached(query: str) -> tuple[list[float], bool]:
    """
    Get embedding for a search query.
    Caches the *embedding* itself isn't cached, but search results are cached
    upstream in the search router.
    """
    embedding = await get_embedding(query)
    return embedding, False


async def ask_question(content: str, question: str, chat_history: Optional[list[dict]] = None) -> str:
    """
    Send note content + question to Groq and return the answer.
    """
    system_prompt = f"""You are a helpful assistant. The user has a note with the following content:

---
{content[:6000]}
---

Answer the user's questions based on the note content. Be concise and accurate. If the answer cannot be found in the note, say so."""

    messages = [{"role": "system", "content": system_prompt}]

    if chat_history:
        for msg in chat_history:
            role = msg.get("role")
            msg_content = msg.get("content")
            if role in ("user", "assistant") and msg_content:
                messages.append({"role": role, "content": msg_content})

    messages.append({"role": "user", "content": question})

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.4,
            max_tokens=1024,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error("Groq Q&A error: %s", e)
        return "Sorry, I could not generate an answer at this time."


async def summarize_note_with_ai(
    content: str,
    format: str = "paragraph",
    extract_alerts: bool = True,
    current_time_str: str = ""
) -> dict:
    """
    Call Groq to summarize note in chosen format (paragraph, bullets, actions)
    and optionally extract calendar events/alerts.
    """
    format_instruction = {
        "paragraph": "a concise 2-3 sentence paragraph summarizing the note content",
        "bullets": "a bulleted list of the main takeaways (each bullet starting with a dash '-')",
        "actions": "a checklist of actionable tasks/to-dos extracted from the note (each starting with '- [ ]')"
    }.get(format, "a concise 2-3 sentence paragraph")

    prompt = f"""You are an advanced AI note-assistant. 
Current date/time context: {current_time_str}

Analyze the note content and perform the following tasks:
1. Generate a summary of type: {format_instruction}. Store it in the "summary" field.
2. Generate 3-7 relevant keyword tags (single words or short phrases, lowercase). Store it in the "tags" field.
3. If extract_alerts is True: scan the note for any mentioned events, tasks, or deadlines that have specific dates/times (e.g. "meeting tomorrow at 3pm", "exam on July 10th", "submit report by monday 5pm"). 
   For each event/deadline, extract:
   - "title": a description of the task or event (e.g., "Submit report", "Meeting with team")
   - "date": the date of the event in "YYYY-MM-DD" format (resolved relative to the current date: {current_time_str})
   - "time": the time of the event in "HH:MM:SS" format (default to "09:00:00" if no time is specified)
   Store this list in the "alerts" field. If none are found, or if extract_alerts is False, return an empty list [].

Respond with ONLY valid JSON, no markdown code blocks, no text explanations.

JSON Schema:
{{
  "summary": "string",
  "tags": ["string"],
  "alerts": [
    {{
      "title": "string",
      "date": "string",
      "time": "string"
    }}
  ]
}}

Note content:
{content[:4000]}"""

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024,
        )
        raw = (response.choices[0].message.content or "").strip()
        json_str = _extract_json_content(raw)
        result = json.loads(json_str)
        if "summary" not in result:
            result["summary"] = ""
        if "tags" not in result:
            result["tags"] = []
        if "alerts" not in result:
            result["alerts"] = []

        return result
    except Exception as e:
        logger.error("Error generating AI summary: %s", e)
        return {"summary": "Failed to generate summary.", "tags": [], "alerts": []}
