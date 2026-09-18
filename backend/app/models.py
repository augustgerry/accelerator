"""
Multi-tenant-ready schema. Every core table carries `workspace_id` even in
the single-user MVP, so opening this up to other divisions or external SI
clients later is a data change, not a schema rewrite.
"""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship, DeclarativeBase
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    title: Mapped[str] = mapped_column(String)
    doc_type: Mapped[str] = mapped_column(String)  # checklist | TOR | SoW | TCO | deck
    division: Mapped[str] = mapped_column(String, default="presales")
    source_drive_id: Mapped[str] = mapped_column(String, nullable=True)
    source_modified_at: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chunks: Mapped[list["DocumentChunk"]] = relationship(back_populates="document")


class DocumentChunk(Base):
    """One row per chunk. `embedding` dimension matches the embedding model in use."""

    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(768))  # adjust to embedding model

    document: Mapped["Document"] = relationship(back_populates="chunks")


class QueryLog(Base):
    """Lightweight usage log — useful later for cost tracking per workspace/division."""

    __tablename__ = "query_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    mode: Mapped[str] = mapped_column(String)  # qa | draft
    question: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProposalSession(Base):
    __tablename__ = "proposal_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    title: Mapped[str] = mapped_column(String)
    file_name: Mapped[str] = mapped_column(String, default="")
    tor_text: Mapped[str] = mapped_column(Text, default="")
    items_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProposalStructure(Base):
    """Stores extracted structural DNA (Table of Contents / Section Hierarchies)
    from real winning proposals in Google Drive and user-curated proposals."""

    __tablename__ = "proposal_structures"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String)
    doc_category: Mapped[str] = mapped_column(String, default="proposal")  # proposal | sow | mom | solution_brief | sla_contract | tor
    archetype: Mapped[str] = mapped_column(String, default="managed_services")  # managed_services | hardware_infra | software_dev
    industry: Mapped[str] = mapped_column(String, default="banking")  # banking | multifinance | telco | enterprise
    client_name: Mapped[str] = mapped_column(String, default="")
    sections_json: Mapped[str] = mapped_column(Text, default="[]")  # List of hierarchical section objects
    total_chapters: Mapped[int] = mapped_column(Integer, default=8)
    win_score: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String, default="gdrive_harvested")  # gdrive_harvested | user_approved | system_baseline
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PresalesRule(Base):
    """Stores persistent presales business rules, style preferences, and learnings
    distilled from user critiques (e.g. 'kepanjangan, buat ringkas', 'ganti BoQ jadi Manpower')."""

    __tablename__ = "presales_rules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    category: Mapped[str] = mapped_column(String, default="structure_constraint")  # structure_constraint | content_density | sla_norm | archetype_substitution
    rule_trigger: Mapped[str] = mapped_column(String, default="all")  # all | managed_services | hardware_infra | software_dev
    instruction: Mapped[str] = mapped_column(Text)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.95)
    source_feedback: Mapped[str] = mapped_column(Text, default="")
    times_applied: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[int] = mapped_column(Integer, default=1)  # 1 = active, 0 = disabled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
