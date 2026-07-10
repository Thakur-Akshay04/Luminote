import hashlib
import json
import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.redis_client import get_redis
from app.config import settings
from app.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from app.services.ai_service import get_embedding
from app.services.auth_service import decode_token

router = APIRouter(prefix="/search", tags=["search"])


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


@router.post("", response_model=SearchResponse)
async def semantic_search(
    body: SearchRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if query is empty or contains no alphanumeric characters
    if not body.query or not re.search(r"\w", body.query):
        return SearchResponse(results=[], cached=False)

    query_hash = hashlib.md5(f"{user_id}:{body.query}".encode()).hexdigest()
    cache_key = f"search:{query_hash}"

    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        items = [SearchResultItem(**r) for r in json.loads(cached)]
        return SearchResponse(results=items, cached=True)

    # Get embedding for the search query
    query_embedding = await get_embedding(body.query)
    if not query_embedding:
        return SearchResponse(results=[], cached=False)

    # pgvector + Full-text search hybrid search
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
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
                    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(array_to_string(tags, ' '), '')),
                    plainto_tsquery('english', :query)
                ) AS fts_rank
            FROM notes
            WHERE user_id = :user_id
        ),
        hybrid_notes AS (
            SELECT
                *,
                GREATEST(0.0, (raw_semantic - 0.45) / 0.40) AS scaled_semantic,
                LEAST(fts_rank * 10.0, 1.0) AS keyword_score
            FROM scored_notes
        ),
        final_notes AS (
            SELECT
                *,
                GREATEST(scaled_semantic, keyword_score) AS similarity
            FROM hybrid_notes
        )
        SELECT *
        FROM final_notes
        WHERE similarity >= 0.35
        ORDER BY similarity DESC
        LIMIT 5
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
