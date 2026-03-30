import time
from dataclasses import dataclass

import redis.asyncio as redis
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine


@dataclass
class ConnectionCheck:
    connected: bool
    latency_ms: float | None
    error: str | None = None


async def check_postgres() -> ConnectionCheck:
    start = time.perf_counter()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        ms = (time.perf_counter() - start) * 1000
        return ConnectionCheck(connected=True, latency_ms=round(ms, 2), error=None)
    except Exception as e:
        ms = (time.perf_counter() - start) * 1000
        return ConnectionCheck(connected=False, latency_ms=round(ms, 2), error=str(e))


async def check_redis() -> ConnectionCheck:
    start = time.perf_counter()
    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        ms = (time.perf_counter() - start) * 1000
        return ConnectionCheck(connected=True, latency_ms=round(ms, 2), error=None)
    except Exception as e:
        ms = (time.perf_counter() - start) * 1000
        return ConnectionCheck(connected=False, latency_ms=round(ms, 2), error=str(e))
    finally:
        await client.aclose()
