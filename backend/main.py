from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import query, draft, documents, health, research

app = FastAPI(
    title="Internal Knowledge & Proposal Accelerator",
    description="RAG-based internal knowledge base and drafting assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(query.router)
app.include_router(draft.router)
app.include_router(documents.router)
app.include_router(research.router)
