"""
Feature 3 — AI Task Extraction service.
"""
import json
import logging
import re
import uuid

from app.config import settings
from app.services.ai_service import _extract_json_content, _sanitize_user_content
from app.services.resilience import call_groq_chat

logger = logging.getLogger(__name__)


async def extract_tasks(content: str) -> list[dict]:
    """Extract action items from sanitized note text using Groq AI."""
    system_prompt = (
        "You are a task extractor. Extract all action items from the text as a JSON array.\n"
        "Return ONLY valid JSON, no markdown, no explanation.\n"
        'Format: [{ "id": "uuid", "text": "task text", "checked": false }]\n'
        "If no tasks found, return an empty array: []"
    )
    sanitized = _sanitize_user_content(content[:6000])

    try:
        response = await call_groq_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": sanitized},
            ],
            model=settings.groq_task_model,
            temperature=0.2,
            max_tokens=2048,
        )

        raw = (response.choices[0].message.content or "").strip()
        if "<think>" in raw:
            raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

        tasks = json.loads(_extract_json_content(raw))
        if not isinstance(tasks, list):
            logger.warning("AI task extraction returned non-list: %s", type(tasks))
            return []

        validated_tasks = []
        for task in tasks:
            if isinstance(task, dict) and "text" in task:
                validated_tasks.append({
                    "id": str(task.get("id") or uuid.uuid4()),
                    "text": str(task["text"])[:500],
                    "checked": bool(task.get("checked", False)),
                })
        return validated_tasks

    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse AI task extraction response: %s", exc)
        return []
    except Exception as exc:
        logger.exception("Groq task extraction error: %s", exc)
        raise
