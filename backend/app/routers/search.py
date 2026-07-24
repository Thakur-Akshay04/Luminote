import hashlib
import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.redis_client import get_redis
from app.config import settings
from app.auth.clerk import get_current_user
from app.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from app.services.ai_service import get_embedding

router = APIRouter(prefix="/search", tags=["search"])

# Maximum allowed query length to prevent abuse
MAX_QUERY_LENGTH = 512


def _validate_embedding_vector(embedding: list[float]) -> str:
    """
    Build a safe embedding string for pgvector by validating each value is a finite number.
    Prevents injection through malformed embedding values.
    """
    validated = []
    for v in embedding:
        if not isinstance(v, (int, float)):
            raise ValueError(f"Embedding contains non-numeric value: {type(v)}")
        fv = float(v)
        if not (-1e10 < fv < 1e10):
            raise ValueError(f"Embedding value out of safe range: {fv}")
        validated.append(str(fv))
    return "[" + ",".join(validated) + "]"


@router.post("", response_model=SearchResponse)
async def semantic_search(
    body: SearchRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Check if query is empty or contains no alphanumeric characters
    if not body.query or not re.search(r"\w", body.query):
        return SearchResponse(results=[], cached=False)

    # Enforce maximum query length to prevent abuse
    if len(body.query) > MAX_QUERY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query too long. Maximum length is {MAX_QUERY_LENGTH} characters."
        )

    # Use SHA-256 instead of MD5 for cache key hashing (cryptographically secure)
    query_hash = hashlib.sha256(f"{user_id}:{body.query}".encode()).hexdigest()
    cache_key = f"search:{query_hash}"

    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        items = [SearchResultItem(**r) for r in json.loads(cached)]
        return SearchResponse(results=items, cached=True)

    # Get embedding for the search query - prepending instruction for BGE embedding retrieval optimization
    query_for_embedding = f"Represent this sentence for searching relevant passages: {body.query}"
    query_embedding = await get_embedding(query_for_embedding)
    if not query_embedding:
        return SearchResponse(results=[], cached=False)

    # Validate and build safe embedding string for pgvector
    try:
        embedding_str = _validate_embedding_vector(query_embedding)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid embedding vector: {e}"
        )

    # pgvector + Full-text search hybrid search
    stmt = text(
        """
        WITH scored_notes AS (
            SELECT
                id, user_id, title, content, summary, tags,
                created_at, updated_at,
                CASE 
                    WHEN embedding IS NOT NULL THEN 1 - (embedding <=> CAST(:embedding AS vector))
                    ELSE 0.55
                END AS raw_semantic,
                ts_rank(
                    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'A'),
                    websearch_to_tsquery('english', :query)
                ) AS fts_rank
            FROM notes
            WHERE user_id = :user_id
        ),
        hybrid_notes AS (
            SELECT
                *,
                GREATEST(0.0, (raw_semantic - 0.45) / 0.40) AS scaled_semantic,
                LEAST(fts_rank * 5.0, 1.0) AS keyword_score
            FROM scored_notes
        ),
        final_notes AS (
            SELECT
                *,
                -- Hybrid weighted sum + small boost for matching both semantic & FTS keyword signals
                (scaled_semantic * 0.6) + (keyword_score * 0.4) + (scaled_semantic * keyword_score * 0.1) AS similarity
            FROM hybrid_notes
        )
        SELECT *
        FROM final_notes
        WHERE similarity >= 0.20
        ORDER BY similarity DESC
        LIMIT 10
        """
    )
    result = await db.execute(
        stmt,
        {"embedding": embedding_str, "user_id": user_id, "query": body.query},
    )
    rows = result.fetchall()

    items = [
        SearchResultItem(
            id=row.id,
            user_id=row.user_id,
            title=row.title,
            content=row.content,
            summary=row.summary,
            tags=row.tags,
            similarity=float(row.similarity),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]

    # Cache for 10 minutes
    await redis.setex(cache_key, settings.search_cache_ttl, json.dumps([i.model_dump(mode="json") for i in items]))

    return SearchResponse(results=items, cached=False)
