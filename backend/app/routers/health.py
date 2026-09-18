from fastapi import APIRouter
from app.services.cache import get_cache_stats, clear_cache

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.get("/health/cache")
def cache_stats():
    return get_cache_stats()


@router.post("/health/cache/clear")
def cache_clear():
    cleared = clear_cache()
    return {"status": "cleared", "entries_removed": cleared}
