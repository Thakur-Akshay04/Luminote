import hashlib
import json
import logging
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.redis_client import get_search_version, redis_get_safe, redis_setex_safe
from app.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from app.services.ai_service import get_embedding

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])

MAX_QUERY_LENGTH = 512


def _validate_embedding_vector(embedding: list[float]) -> str:
    """Build a safe embedding string for pgvector by validating each value is finite."""
    validated = []
    for v in embedding:
        if not isinstance(v, (int, float)):
            raise ValueError("Embedding contains non-numeric value")
        fv = float(v)
        if not (-1e10 < fv < 1e10):
            raise ValueError("Embedding value out of safe range")
        validated.append(str(fv))
    return "[" + ",".join(validated) + "]"


@router.post("", response_model=SearchResponse)
@limiter.limit("20/minute")
async def semantic_search(
    request: Request,
    body: SearchRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not body.query or not re.search(r"\w", body.query):
        return SearchResponse(results=[], cached=False)

    if len(body.query) > MAX_QUERY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query too long. Maximum length is {MAX_QUERY_LENGTH} characters.",
        )

    search_ver = await get_search_version(user_id)
    query_hash = hashlib.sha256(f"{user_id}:{search_ver}:{body.query}".encode()).hexdigest()
    cache_key = f"user:{user_id}:search:{query_hash}"

    cached = await redis_get_safe(cache_key, cache_name="search")
    if cached:
        items = [SearchResultItem(**r) for r in json.loads(cached)]
        return SearchResponse(results=items, cached=True)

    query_for_embedding = f"Represent this sentence for searching relevant passages: {body.query}"
    query_embedding = await get_embedding(query_for_embedding)
    if not query_embedding:
        return SearchResponse(results=[], cached=False)

    try:
        embedding_str = _validate_embedding_vector(query_embedding)
    except ValueError as exc:
        logger.error("Invalid embedding generated during search: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed due to invalid embedding data",
        )

    # Enable iterative HNSW scan (requires PostgreSQL pgvector >= 0.8.0) so per-user
    # filtered vector candidate retrieval does not truncate early at hnsw.ef_search.
    try:
        async with db.begin_nested():
            await db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
    except Exception as exc:
        logger.warning(
            "Could not enable hnsw.iterative_scan (requires pgvector >= 0.8.0): %s",
            exc,
        )

    # Hybrid pgvector HNSW + GIN FTS search:
    # - vec_candidates leverages iterative HNSW scan (>= pgvector 0.8.0) for per-user recall.
    # - fts_candidates orders matches by weighted ts_rank before LIMIT 50.
    stmt = text(
        """
        WITH vec_candidates AS (
            SELECT id
            FROM notes
            WHERE user_id = :user_id AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 50
        ),
        fts_candidates AS (
            SELECT id
            FROM notes
            WHERE user_id = :user_id
              AND (
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags, ' '), '')), 'A')
              ) @@ websearch_to_tsquery('english', :query)
            ORDER BY ts_rank(
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags, ' '), '')), 'A'),
                websearch_to_tsquery('english', :query)
            ) DESC, id DESC
            LIMIT 50
        ),
        candidate_ids AS (
            SELECT id FROM vec_candidates
            UNION
            SELECT id FROM fts_candidates
        ),
        scored_notes AS (
            SELECT
                n.id, n.user_id, n.title, n.content, n.summary, n.tags,
                n.created_at, n.updated_at,
                CASE
                    WHEN n.embedding IS NOT NULL THEN 1 - (n.embedding <=> CAST(:embedding AS vector))
                    ELSE 0.55
                END AS raw_semantic,
                ts_rank(
                    setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(n.content, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(immutable_array_to_string(n.tags, ' '), '')), 'A'),
                    websearch_to_tsquery('english', :query)
                ) AS fts_rank
            FROM notes n
            INNER JOIN candidate_ids c ON n.id = c.id
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

    await redis_setex_safe(
        cache_key,
        settings.search_cache_ttl,
        json.dumps([i.model_dump(mode="json") for i in items]),
        cache_name="search",
    )

    return SearchResponse(results=items, cached=False)
