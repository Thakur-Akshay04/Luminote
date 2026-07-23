import hashlib
import json
import logging
import re
from typing import Optional, cast

from groq.types.chat import ChatCompletionMessageParam

import httpx

from app.config import settings
from app.redis_client import get_redis
from app.groq_client import client, MODEL

logger = logging.getLogger(__name__)


def _sha256(text: str) -> str:
    """Use SHA-256 instead of MD5 for cache key hashing (cryptographically secure)."""
    return hashlib.sha256(text.encode()).hexdigest()


def _sanitize_user_content(text: str) -> str:
    """
    Sanitize user-provided content before injecting into LLM prompts.
    Strips control characters and excessive whitespace to reduce prompt injection risk.
    """
    # Remove ASCII control characters (except newline, tab, carriage return)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Collapse excessive blank lines (more than 2 consecutive) to prevent prompt padding attacks
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return text.strip()


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
    1. SHA-256 hash the content
    2. Check Redis cache at ai_response:{hash}
    3. On miss: call Groq for summary + tags
    4. Return { summary, tags }
    Result is cached for 7 days.
    """
    content_hash = _sha256(content)
    cache_key = f"ai_response:{content_hash}"

    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        logger.info("AI cache HIT for hash %s", content_hash)
        return json.loads(cached)

    logger.info("AI cache MISS for hash %s — calling Groq", content_hash)

    sanitized_content = _sanitize_user_content(content[:4000])

    prompt = f"""Analyze the following note content and return a JSON object with exactly two fields:
- "summary": a concise 1-3 sentence summary of the note
- "tags": an array of 3-7 relevant keyword tags (single words or short phrases, lowercase)

Respond with ONLY valid JSON, no markdown, no explanation.

Note content:
{sanitized_content}"""

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            temperature=0.3,
            max_tokens=512,
            timeout=30,
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
        
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
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
    sanitized_content = _sanitize_user_content(content[:6000])
    sanitized_question = _sanitize_user_content(question[:2000])

    system_prompt = f"""You are a helpful assistant. The user has a note with the following content:

---
{sanitized_content}
---

Answer the user's questions based on the note content. Be concise and accurate. If the answer cannot be found in the note, say so."""

    messages = [{"role": "system", "content": system_prompt}]

    if chat_history:
        for msg in chat_history:
            role = msg.get("role")
            msg_content = msg.get("content")
            if role in ("user", "assistant") and msg_content:
                messages.append({"role": role, "content": _sanitize_user_content(str(msg_content)[:2000])})

    if not sanitized_question:
        return "Please ask a valid question."

    messages.append({"role": "user", "content": sanitized_question})

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=cast(list[ChatCompletionMessageParam], messages),
            temperature=0.4,
            max_tokens=1024,
            timeout=30,
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content.strip()
        return "Sorry, I could not generate an answer at this time."
    except Exception as e:
        logger.error("Groq Q&A error: %s", e)
        return "Sorry, I could not generate an answer at this time."


async def summarize_note_with_ai(
    content: str,
    summary_format: str = "paragraph",
    extract_alerts: bool = True,
    current_time_str: str = ""
) -> dict:
    """
    Call Groq to summarize note in chosen format (paragraph, bullets, actions)
    and optionally extract calendar events/alerts.
    """
    format_instruction = {
        "paragraph": "a clean, textual paragraph overview summarizing core ideas",
        "bullets": "a clear, scannable bullet point list of key insights (each bullet line starting with '- ')",
        "actions": "actionable items, tasks, and follow-ups extracted from the note (each item starting with '- [ ] ')"
    }.get(summary_format, "a clean, textual paragraph overview summarizing core ideas")

    sanitized_content = _sanitize_user_content(content[:4000])

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
{sanitized_content}"""

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            temperature=0.3,
            max_tokens=1024,
            timeout=30,
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


async def execute_ai_action(action: str, text: str, param: Optional[str] = None) -> str:
    """
    Perform a custom AI writing assistant action (rewrite, translate, tone change, grammar, simplify, expand)
    on the provided text using Groq.
    """
    sanitized_text = _sanitize_user_content(text[:4000])
    
    if action == "tone":
        tone = (param or "professional").strip().lower()
        prompt = f"Rewrite the following text in a {tone} tone, preserving its core meaning. Respond with only the rewritten text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    elif action == "translate":
        lang = (param or "English").strip()
        prompt = f"Translate the following text into {lang}. Respond with only the translation, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    elif action == "grammar":
        prompt = f"Fix any spelling, grammar, and punctuation errors in the following text, and polish it to flow naturally. Respond with only the corrected text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    elif action == "simplify":
        prompt = f"Simplify the vocabulary and structure of the following text to make it easy to understand. Respond with only the simplified text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    elif action == "expand":
        prompt = f"Expand on the following text by adding more detail and context, while keeping the tone appropriate. Respond with only the expanded text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    else:
        prompt = f"Rewrite or improve the following text. Respond with only the modified text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            temperature=0.3,
            max_tokens=1500,
            timeout=30,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error("Error executing AI writing action %s: %s", action, e)
        return "Failed to process text with AI. Please try again."
