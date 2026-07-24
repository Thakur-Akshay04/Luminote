"""
Feature 3 — AI Task Extraction service.

Sends note content to Groq for task extraction using the specified system prompt.
"""
import json
import logging
import uuid

from app.config import settings
from app.groq_client import client
from app.services.ai_service import _extract_json_content

logger = logging.getLogger(__name__)


async def extract_tasks(content: str) -> list[dict]:
    """Extract action items from text using Groq AI.

    Sends content to Groq with the exact system prompt specified.
    Parses response in a single pass — O(n) where n = extracted items.
    Returns list of { id, text, checked } dicts.
    """
    system_prompt = (
        "You are a task extractor. Extract all action items from the text as a JSON array.\n"
        "Return ONLY valid JSON, no markdown, no explanation.\n"
        'Format: [{ "id": "uuid", "text": "task text", "checked": false }]\n'
        "If no tasks found, return an empty array: []"
    )

    try:
        response = await client.chat.completions.create(
            model=settings.groq_task_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content[:6000]},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        raw = (response.choices[0].message.content or "").strip()

        # Handle reasoning-model <think>...</think> wrapping
        if "<think>" in raw:
            # Strip the <think>...</think> block and take remaining content
            import re
            raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

        json_str = _extract_json_content(raw)
        tasks = json.loads(json_str)

        if not isinstance(tasks, list):
            logger.warning("AI task extraction returned non-list: %s", type(tasks))
            return []

        # Ensure each task has required fields, generate UUIDs if missing — O(n) single pass
        validated_tasks = []
        for task in tasks:
            if isinstance(task, dict) and "text" in task:
                validated_tasks.append({
                    "id": task.get("id", str(uuid.uuid4())),
                    "text": task["text"],
                    "checked": bool(task.get("checked", False)),
                })

        return validated_tasks

    except json.JSONDecodeError as e:
        logger.exception("Failed to parse AI task extraction response: %s", e)
        return []
    except Exception as e:
        logger.exception("Groq task extraction error: %s", e)
        raise
