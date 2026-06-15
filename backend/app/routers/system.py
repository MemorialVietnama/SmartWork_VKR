from fastapi import APIRouter

from app.services.connectivity import check_postgres, check_redis

router = APIRouter()


@router.get("/status")
async def connections_status():
    pg = await check_postgres()
    rd = await check_redis()
    return {
        "postgres": {
            "connected": pg.connected,
            "latency_ms": pg.latency_ms,
            "error": pg.error,
        },
        "redis": {
            "connected": rd.connected,
            "latency_ms": rd.latency_ms,
            "error": rd.error,
        },
    }
