import time
import uuid
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.routers import query, draft, documents, health, research, sessions
from app.services.embeddings import warm_up

logger = logging.getLogger("synapse.telemetry")

app = FastAPI(
    title="Internal Knowledge & Proposal Accelerator",
    description="RAG-based internal knowledge base and drafting assistant",
    version="0.1.0",
)


@app.on_event("startup")
def _warm_up_models():
    warm_up()
    try:
        from app.services.retrieval import _get_reranker
        _get_reranker()
    except Exception:
        pass


# 1. Telemetry, Timing & Correlation ID Middleware
@app.middleware("http")
async def telemetry_middleware(request: Request, call_next):
    # Correlation ID (use incoming X-Request-ID or generate new UUID)
    request_id = request.headers.get("X-Request-ID") or f"syn-{uuid.uuid4().hex[:12]}"
    start_time = time.perf_counter()

    try:
        response = await call_next(request)
        process_time = time.perf_counter() - start_time

        # Inject telemetry headers into response
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}s"

        # Slow request observability warning (> 3s)
        if process_time > 3.0:
            logger.warning(
                "SLOW_REQUEST: %s %s took %.2fs [req_id=%s, status=%d]",
                request.method,
                request.url.path,
                process_time,
                request_id,
                response.status_code,
            )
        return response

    except Exception as exc:
        process_time = time.perf_counter() - start_time
        logger.error(
            "UNHANDLED_EXCEPTION: %s %s failed after %.2fs [req_id=%s]: %s",
            request.method,
            request.url.path,
            process_time,
            request_id,
            exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal Server Error",
                "request_id": request_id,
                "error": str(exc),
            },
            headers={
                "X-Request-ID": request_id,
                "X-Process-Time": f"{process_time:.4f}s",
            },
        )


# 2. CORS Middleware with exposed telemetry headers
app.add_middleware(
    CORSMiddleware,
    # Matches any localhost/127.0.0.1 port, so the frontend dev server works
    # regardless of which port Next.js happens to pick.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)

from fastapi.staticfiles import StaticFiles

app.include_router(health.router)
app.include_router(query.router)
app.include_router(draft.router)
app.include_router(documents.router)
app.include_router(research.router)
app.include_router(sessions.router)

app.mount("/assets", StaticFiles(directory="app/assets"), name="assets")

