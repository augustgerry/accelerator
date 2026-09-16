from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import query, draft, documents, health, research, sessions
from app.services.embeddings import warm_up

app = FastAPI(
    title="Internal Knowledge & Proposal Accelerator",
    description="RAG-based internal knowledge base and drafting assistant",
    version="0.1.0",
)


@app.on_event("startup")
def _warm_up_embedding_model():
    warm_up()

app.add_middleware(
    CORSMiddleware,
    # Matches any localhost/127.0.0.1 port, so the frontend dev server works
    # regardless of which port Next.js happens to pick.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(query.router)
app.include_router(draft.router)
app.include_router(documents.router)
app.include_router(research.router)
app.include_router(sessions.router)
