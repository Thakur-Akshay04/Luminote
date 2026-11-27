import asyncio
import hashlib
import json
import logging
import re
from typing import Optional, cast

from fastapi import HTTPException, status
from groq.types.chat import ChatCompletionMessageParam

from app.config import settings
from app.groq_client import MODEL
from app.redis_client import redis_get_safe, redis_setex_safe
from app.services.resilience import (
    CircuitBreakerOpenError,
    call_groq_chat,
    get_http_client,
    hf_breaker,
)

logger = logging.getLogger(__name__)


def _sha256(text: str) -> str:
    """Use SHA-256 for cache key hashing."""
    return hashlib.sha256(text.encode()).hexdigest()


def _sanitize_user_content(text: str) -> str:
    """Sanitize user-provided content before injecting into LLM prompts."""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _extract_json_content(raw: str) -> str:
    """Extract a complete JSON object or array, preserving plain arrays and fenced blocks."""
    raw = raw.strip()
    if "```" in raw:
        for part in raw.split("```"):
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if (part.startswith("{") and part.endswith("}")) or (part.startswith("[") and part.endswith("]")):
                return part

    try:
        json.loads(raw)
        return raw
    except Exception:
        pass

    obj_start = raw.find("{")
    arr_start = raw.find("[")
    if arr_start != -1 and (obj_start == -1 or arr_start < obj_start):
        arr_end = raw.rfind("]")
        if arr_end > arr_start:
            return raw[arr_start : arr_end + 1]
    elif obj_start != -1:
        obj_end = raw.rfind("}")
        if obj_end > obj_start:
            return raw[obj_start : obj_end + 1]

    return raw


async def get_ai_enrichment(content: str) -> dict:
    """Check Redis cache, else call Groq for summary + tags, and cache for 7 days."""
    content_hash = _sha256(content)
    cache_key = f"ai_response:{content_hash}"

    cached = await redis_get_safe(cache_key, cache_name="ai_enrichment")
    if cached:
        logger.debug("AI cache HIT for hash %s", content_hash)
        return json.loads(cached)

    logger.debug("AI cache MISS for hash %s — calling Groq", content_hash)
    sanitized_content = _sanitize_user_content(content[:4000])

    prompt = f"""Analyze the following note content and return a JSON object with exactly two fields:
- "summary": a concise 1-3 sentence summary of the note
- "tags": an array of 3-7 relevant keyword tags (single words or short phrases, lowercase)

Respond with ONLY valid JSON, no markdown, no explanation.

Note content:
{sanitized_content}"""

    try:
        response = await call_groq_chat(
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            model=MODEL,
            temperature=0.3,
            max_tokens=512,
        )
        raw = (response.choices[0].message.content or "").strip()
        result = json.loads(_extract_json_content(raw))
        result.setdefault("summary", "")
        result.setdefault("tags", [])
    except Exception as exc:
        logger.exception("Groq API error: %s", exc)
        return {"summary": "", "tags": []}

    await redis_setex_safe(cache_key, settings.ai_cache_ttl, json.dumps(result), cache_name="ai_enrichment")
    return result


_local_embed_model = None


def _get_local_embedding_sync(text: str) -> list[float]:
    global _local_embed_model
    if _local_embed_model is None:
        from fastembed import TextEmbedding

        _local_embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    vec = next(iter(_local_embed_model.embed([text[:8000]])))
    return [float(x) for x in vec]


async def get_embedding(text: str) -> list[float]:
    """
    Generate a 384-dimensional embedding using BAAI/bge-small-en-v1.5.
    Uses Hugging Face Inference API (protected by circuit breaker) when HF_API_KEY is set,
    gracefully falling back to local fastembed.
    """
    hf_key = (getattr(settings, "hf_api_key", "") or "").strip()
    if hf_key:
        async def _call_hf() -> list[float]:
            api_url = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5"
            headers = {"Authorization": f"Bearer {hf_key}"}
            http_client = get_http_client()
            response = await http_client.post(
                api_url,
                headers=headers,
                json={"inputs": text[:8000]},
                timeout=15.0,
            )
            response.raise_for_status()
            result = response.json()
            if isinstance(result, list) and len(result) > 0:
                if isinstance(result[0], list):
                    return [float(x) for x in result[0]]
                return [float(x) for x in result]
            raise ValueError("Unexpected Hugging Face embedding payload shape")

        try:
            return await hf_breaker.call(_call_hf)
        except CircuitBreakerOpenError:
            logger.debug("HF circuit breaker open — using local fastembed fallback")
        except Exception as exc:
            logger.warning("Hugging Face embedding failed (%s); falling back to local fastembed", exc)

    try:
        return await asyncio.to_thread(_get_local_embedding_sync, text)
    except Exception as exc:
        logger.exception("Local fastembed embedding error: %s", exc)
        return []


async def ask_question(content: str, question: str, chat_history: Optional[list[dict]] = None) -> str:
    """Send note content + question to Groq and return the answer."""
    sanitized_content = _sanitize_user_content(content[:6000])
    sanitized_question = _sanitize_user_content(question[:2000])

    if not sanitized_question:
        return "Please ask a valid question."

    system_prompt = f"""You are a helpful assistant. The user has a note with the following content:

---
{sanitized_content}
---

Answer the user's questions based on the note content. Be concise and accurate. If the answer cannot be found in the note, say so."""

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if chat_history:
        for msg in chat_history[-20:]:  # Bound context window to recent turns
            role = msg.get("role")
            msg_content = msg.get("content")
            if role in ("user", "assistant") and msg_content:
                messages.append({"role": role, "content": _sanitize_user_content(str(msg_content)[:2000])})

    messages.append({"role": "user", "content": sanitized_question})

    try:
        response = await call_groq_chat(
            messages=cast(list[ChatCompletionMessageParam], messages),
            model=MODEL,
            temperature=0.4,
            max_tokens=1024,
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content.strip()
        return "Sorry, I could not generate an answer at this time."
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Groq Q&A error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service failed to generate an answer. Please try again.",
        )


async def summarize_note_with_ai(
    content: str,
    summary_format: str = "paragraph",
    extract_alerts: bool = True,
    current_time_str: str = "",
) -> dict:
    """Call Groq to summarize note and optionally extract calendar events/alerts."""
    format_instruction = {
        "paragraph": "a clean, textual paragraph overview summarizing core ideas",
        "bullets": "a clear, scannable bullet point list of key insights (each bullet line starting with '- ')",
        "actions": "actionable items, tasks, and follow-ups extracted from the note (each item starting with '- [ ] ')",
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
        response = await call_groq_chat(
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            model=MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
        raw = (response.choices[0].message.content or "").strip()
        result = json.loads(_extract_json_content(raw))
        result.setdefault("summary", "")
        result.setdefault("tags", [])
        result.setdefault("alerts", [])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error generating AI summary: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service failed to generate summary. Please try again.",
        )


async def execute_ai_action(action: str, text: str, param: Optional[str] = None) -> str:
    """Perform a custom AI writing assistant action on the provided text using Groq."""
    sanitized_text = _sanitize_user_content(text[:4000])
    safe_param = _sanitize_user_content((param or "")[:100])

    if action == "tone":
        tone = (safe_param or "professional").lower()
        prompt = f"Rewrite the following text in a {tone} tone, preserving its core meaning. Respond with only the rewritten text, no explanations, no quotes, no conversational filler:\n\n{sanitized_text}"
    elif action == "translate":
        lang = safe_param or "English"
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
        response = await call_groq_chat(
            messages=cast(list[ChatCompletionMessageParam], [{"role": "user", "content": prompt}]),
            model=MODEL,
            temperature=0.3,
            max_tokens=1500,
        )
        return (response.choices[0].message.content or "").strip()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error executing AI writing action %s: %s", action, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service failed to process text. Please try again.",
        )
