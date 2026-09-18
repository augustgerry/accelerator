"""
Autonomous Presales Learning & Knowledge Synthesis Engine
- Persistent Presales Rules: Distills user critiques into reusable rules.
- Structural DNA Memory: Stores and retrieves real ToC structures from past winning proposals.
- Dynamic Few-Shot Synthesis: Supplies real historical proposal skeletons to the generation prompt.
- Auto-Harvesting: Saves approved proposal structures back into the system's memory.
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from app.models import PresalesRule, ProposalStructure
from app.config import settings

logger = logging.getLogger(__name__)

# Baseline rules representing PT Smartnet Magna Global winning presales methodology
BASELINE_RULES = [
    {
        "category": "strict_source_grounding",
        "rule_trigger": "all",
        "instruction": "PRINSIP ZERO-HALLUCINATION / ANTI-NGIDE: Semua rekomendasi sub-bab dan draf proposal WAJIB 100% berakar pada dokumen acuan sumber (TOR/RFP/KAK). DILARANG KERAS mengarang spesifikasi, nama platform yang tidak diminta, jumlah tim/personel, atau SLA yang tidak tertulis pada dokumen sumber.",
        "confidence_score": 1.0,
        "source_feedback": "Aturan Mutlak: Semua harus dari acuan dokumen sumber, tidak boleh ngide sendiri.",
    },
    {
        "category": "structure_constraint",
        "rule_trigger": "all",
        "instruction": "Batasi struktur proposal teknis hanya pada 7 s.d. 8 Bab Pokok yang esensial (format Lean Presales Enterprise). HINDARI memecah jadi 10+ bab terpisah seperti Executive Summary, Company Profile, atau S&K terpisah kecuali diminta secara eksplisit dalam TOR.",
        "confidence_score": 0.98,
        "source_feedback": "Standar evaluasi tender perbankan & enterprise CTI Group",
    },
    {
        "category": "archetype_substitution",
        "rule_trigger": "managed_services",
        "instruction": "Pada proyek Managed Services & Jasa Operasional: DILARANG KERAS memunculkan bab Hardware Sizing / Topologi SAN / BoQ Perangkat. Wajib gantikan dengan: Model Operasi 24x7 Rotational Shift, Prosedur Deteksi & Eskalasi Insiden (<5 Menit), Skill Matrix Shift, dan Manpower Plan bertahap.",
        "confidence_score": 0.99,
        "source_feedback": "TOR Managed Services SMBC Indonesia 2027-2029",
    },
    {
        "category": "content_density",
        "rule_trigger": "all",
        "instruction": "Terapkan Content-Density Tinggi: Hindari narasi basa-basi/klise. Utamakan tabel Markdown terstruktur (Tabel Shift Roster, Matriks RACI, Matriks SLA, Compliance Matrix) dan sebutkan angka kuantitatif nyata (jam kerja, SLA response time, kuota headcount, SLA recovery).",
        "confidence_score": 0.95,
        "source_feedback": "Standar kejelasan dokumen teknis presales",
    },
    {
        "category": "sla_norm",
        "rule_trigger": "managed_services",
        "instruction": "Standar penanganan insiden L1 Managed Services perbankan: Response Time <5 menit, Escalation Time <5 menit ke L2/tim spesialis via ServiceNow, serta jaminan 100% resource availability per shift.",
        "confidence_score": 0.97,
        "source_feedback": "Klausul b.i.3 dan b.i.4 TOR Bank SMBC",
    },
]


def seed_default_rules(db: Session, workspace_id: str = settings.default_workspace_id) -> int:
    """Ensure baseline presales rules are seeded for the workspace."""
    seeded = 0
    for r in BASELINE_RULES:
        existing = db.execute(
            select(PresalesRule).where(
                PresalesRule.workspace_id == workspace_id,
                PresalesRule.category == r["category"],
                PresalesRule.rule_trigger == r["rule_trigger"],
            )
        ).scalar_one_or_none()

        if not existing:
            new_rule = PresalesRule(
                id=f"rule-{uuid.uuid4().hex[:10]}",
                workspace_id=workspace_id,
                category=r["category"],
                rule_trigger=r["rule_trigger"],
                instruction=r["instruction"],
                confidence_score=r["confidence_score"],
                source_feedback=r["source_feedback"],
                times_applied=1,
                is_active=1,
            )
            db.add(new_rule)
            seeded += 1

    if seeded > 0:
        db.commit()
        logger.info(f"Seeded {seeded} baseline presales rules for workspace '{workspace_id}'.")
    return seeded


def retrieve_active_rules(db: Session, workspace_id: str = settings.default_workspace_id, archetype: str = "all") -> List[str]:
    """Retrieve all active presales rules applicable to the given archetype."""
    try:
        stmt = (
            select(PresalesRule)
            .where(
                PresalesRule.workspace_id == workspace_id,
                PresalesRule.is_active == 1,
            )
            .order_by(desc(PresalesRule.confidence_score))
        )
        rules = db.execute(stmt).scalars().all()
        applicable = []
        for r in rules:
            if r.rule_trigger == "all" or r.rule_trigger == archetype:
                applicable.append(r.instruction)
        return applicable
    except Exception as e:
        logger.warning(f"Failed to retrieve presales rules from database: {e}")
        return [r["instruction"] for r in BASELINE_RULES if r["rule_trigger"] in ("all", archetype)]


def find_closest_winning_structures(
    db: Session,
    workspace_id: str = settings.default_workspace_id,
    archetype: str = "managed_services",
    limit: int = 2,
) -> List[Dict[str, Any]]:
    """Retrieve the closest winning proposal structures matching the given archetype."""
    try:
        stmt = (
            select(ProposalStructure)
            .where(
                ProposalStructure.workspace_id == workspace_id,
                ProposalStructure.archetype == archetype,
            )
            .order_by(desc(ProposalStructure.win_score), desc(ProposalStructure.updated_at))
            .limit(limit)
        )
        records = db.execute(stmt).scalars().all()
        results = []
        for rec in records:
            try:
                sections = json.loads(rec.sections_json)
            except Exception:
                sections = []
            results.append({
                "id": rec.id,
                "title": rec.title,
                "archetype": rec.archetype,
                "industry": rec.industry,
                "client_name": rec.client_name,
                "total_chapters": rec.total_chapters,
                "sections": sections,
                "win_score": rec.win_score,
            })
        return results
    except Exception as e:
        logger.warning(f"Failed to find winning structures in database: {e}")
        return []


def save_or_update_proposal_structure(
    db: Session,
    title: str,
    sections: List[Dict[str, Any]],
    archetype: str,
    industry: str = "banking",
    client_name: str = "",
    doc_category: str = "proposal",
    workspace_id: str = settings.default_workspace_id,
    source: str = "gdrive_harvested",
    document_id: Optional[str] = None,
    win_score: float = 1.0,
) -> ProposalStructure:
    """Save an extracted or user-approved document/proposal structure into memory."""
    total_main = sum(1 for s in sections if s.get("level", 1) == 1) or len(sections)

    existing = db.execute(
        select(ProposalStructure).where(
            ProposalStructure.workspace_id == workspace_id,
            ProposalStructure.title == title,
        )
    ).scalar_one_or_none()

    if existing:
        existing.sections_json = json.dumps(sections, ensure_ascii=False)
        existing.archetype = archetype
        existing.industry = industry
        existing.client_name = client_name or existing.client_name
        existing.doc_category = doc_category
        existing.total_chapters = total_main
        existing.win_score = win_score
        existing.source = source
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    new_struct = ProposalStructure(
        id=f"struct-{uuid.uuid4().hex[:10]}",
        workspace_id=workspace_id,
        document_id=document_id,
        title=title,
        doc_category=doc_category,
        archetype=archetype,
        industry=industry,
        client_name=client_name,
        sections_json=json.dumps(sections, ensure_ascii=False),
        total_chapters=total_main,
        win_score=win_score,
        source=source,
    )
    db.add(new_struct)
    db.commit()
    db.refresh(new_struct)
    return new_struct


def distill_knowledge_from_document(
    db: Session,
    title: str,
    raw_text: str,
    workspace_id: str = settings.default_workspace_id,
    archetype: str = "all",
    doc_category: str = "document",
) -> List[PresalesRule]:
    """Analyze an uploaded or synced reference document (SOW, MoM, Proposal, SLA, Solution Brief)
    and autonomously extract high-value reusable presales rules, SLA benchmarks, scope boundaries,
    and operational patterns into the PresalesRule memory table."""
    if not raw_text or len(raw_text.strip()) < 300:
        return []

    from app.services.llm_provider import get_llm_provider
    import re

    # Take representative text (up to 12,000 characters)
    sample_text = raw_text[:12000]
    effective_trigger = archetype if archetype in ("managed_services", "hardware_infra", "software_dev") else "all"

    prompt = (
        f"Anda adalah Chief Presales Knowledge Distiller di PT Smartnet Magna Global (SMG) / CTI Group.\n"
        f"Tugas: Pelajari dokumen acuan internal berikut:\n"
        f"- Judul Dokumen: {title}\n"
        f"- Kategori Dokumen: {doc_category}\n"
        f"- Archetype Solusi: {archetype}\n\n"
        f"Teks Dokumen Acuan (Cuplikan):\n{sample_text}\n\n"
        f"Ekstrak maksimal 3 (tiga) ATURAN, NORMA OPERASIONAL, STANDAR SLA, BATASAN SCOPE, atau KEBUTUHAN KUALIFIKASI "
        f"yang bersifat reusable (dapat dipelajari dan diterapkan untuk penawaran atau tender berikutnya).\n"
        f"Fokus pada fakta nyata di dokumen:\n"
        f"1. Standar SLA & Penanganan Insiden (response time, escalation, model shift, tools seperti ServiceNow).\n"
        f"2. Batasan Ruang Lingkup (hal-hal yang secara tegas In-Scope atau Out-of-Scope).\n"
        f"3. Syarat Kualifikasi / Legal / Screening (SLIK checking, NDA, sertifikasi minimum).\n"
        f"4. Norma Teknologi / Ekosistem Data Platform / Arsitektur spesifik.\n\n"
        f"DILARANG MENGARANG (ZERO HALLUCINATION). Hanya ekstrak yang tertulis nyata di dokumen.\n"
        f"Keluarkan HANYA JSON array valid tanpa markdown pembuka/penutup:\n"
        f"[\n"
        f'  {{\n'
        f'    "category": "sla_norm | scope_boundary | compliance_mandate | content_density | tech_stack_norm",\n'
        f'    "rule_trigger": "{effective_trigger}",\n'
        f'    "instruction": "Kalimat aturan imperatif dalam Bahasa Indonesia formal yang padat dan jelas (1-2 kalimat)",\n'
        f'    "confidence_score": 0.95\n'
        f'  }}\n'
        f"]"
    )

    provider = get_llm_provider()
    distilled_rules: List[PresalesRule] = []
    try:
        raw_resp = provider.answer(question=prompt, context_chunks=[], mode="json")
        cleaned = raw_resp.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
        if isinstance(data, list):
            for it in data:
                instr = str(it.get("instruction") or "").strip()
                if not instr or len(instr) < 15:
                    continue
                cat = str(it.get("category") or "content_density")
                trig = str(it.get("rule_trigger") or archetype or "all")
                conf = float(it.get("confidence_score") or 0.95)

                # Check deduplication against existing active rules
                existing = db.execute(
                    select(PresalesRule).where(
                        PresalesRule.workspace_id == workspace_id,
                        PresalesRule.category == cat,
                        PresalesRule.instruction == instr,
                    )
                ).scalar_one_or_none()

                if existing:
                    existing.times_applied += 1
                    existing.confidence_score = min(1.0, existing.confidence_score + 0.01)
                    db.commit()
                    distilled_rules.append(existing)
                else:
                    new_rule = PresalesRule(
                        id=f"rule-{uuid.uuid4().hex[:10]}",
                        workspace_id=workspace_id,
                        category=cat,
                        rule_trigger=trig,
                        instruction=instr,
                        confidence_score=conf,
                        source_feedback=f"Otomatis dipelajari dari dokumen: {title} ({doc_category})",
                        times_applied=1,
                        is_active=1,
                    )
                    db.add(new_rule)
                    db.commit()
                    db.refresh(new_rule)
                    distilled_rules.append(new_rule)
                    logger.info(f"Learned new rule from '{title}': {instr}")
    except Exception as e:
        logger.warning(f"Failed to distill rules from document '{title}': {e}")

    return distilled_rules


def learn_from_document(
    db: Session,
    title: str,
    raw_text: str,
    file_bytes: bytes = b"",
    workspace_id: str = settings.default_workspace_id,
    document_id: Optional[str] = None,
    source: str = "user_upload",
) -> Dict[str, Any]:
    """Unified autonomous learning engine: extracts structural DNA and distills
    reusable presales rules & domain knowledge from ANY document format (Proposal, SOW, MoM, SLA, Solution Brief)."""
    from app.services.document_parser import extract_document_structure

    # 1. Structural DNA Harvesting
    struct_data = extract_document_structure(file_bytes=file_bytes, file_name=title, raw_text=raw_text)
    saved_struct = None
    if struct_data.get("sections"):
        saved_struct = save_or_update_proposal_structure(
            db=db,
            title=title,
            sections=struct_data["sections"],
            archetype=struct_data.get("archetype", "managed_services"),
            industry=struct_data.get("industry", "banking"),
            client_name=struct_data.get("client_name", ""),
            doc_category=struct_data.get("doc_category", "proposal"),
            workspace_id=workspace_id,
            source=source,
            document_id=document_id,
        )

    # 2. Autonomous Knowledge & Rule Distillation
    distilled_rules = distill_knowledge_from_document(
        db=db,
        title=title,
        raw_text=raw_text,
        workspace_id=workspace_id,
        archetype=struct_data.get("archetype", "all"),
        doc_category=struct_data.get("doc_category", "document"),
    )

    return {
        "title": title,
        "doc_category": struct_data.get("doc_category", "document"),
        "archetype": struct_data.get("archetype", "all"),
        "client_name": struct_data.get("client_name", ""),
        "sections_harvested": len(struct_data.get("sections", [])),
        "structure_saved": saved_struct is not None,
        "rules_learned_count": len(distilled_rules),
        "rules_learned": [r.instruction for r in distilled_rules],
    }


def distill_learning_from_feedback(
    db: Session,
    feedback_text: str,
    current_structure: Optional[List[Dict[str, Any]]] = None,
    refined_structure: Optional[List[Dict[str, Any]]] = None,
    workspace_id: str = settings.default_workspace_id,
    archetype_context: str = "all",
) -> PresalesRule:
    """Analyze user critique (e.g. 'kepanjangan, buat ringkas tapi penting semua')
    using LLM and distill it into a permanent, reusable PresalesRule."""
    from app.services.llm_provider import get_llm_provider

    prompt = (
        "Anda adalah Chief Presales Strategist AI. Seorang presales engineer memberikan kritik/feedback "
        "terhadap draf struktur proposal teknis tender:\n\n"
        f"Kritik/Instruksi User: \"{feedback_text}\"\n"
        f"Konteks Tender/Archetype: {archetype_context}\n\n"
        "Tugas Anda: Distilasikan feedback tersebut menjadi SATU ATURAN PRESALES BAKU (Rule) "
        "yang ringkas, imperatif, dan dapat dipatuhi oleh model AI pada generasi proposal berikutnya "
        "agar kesalahan serupa TIDAK PERNAH TERULANG LAGI.\n\n"
        "Keluarkan HANYA JSON object valid tanpa teks pembuka/penutup:\n"
        "{\n"
        '  "category": "structure_constraint | content_density | sla_norm | archetype_substitution",\n'
        '  "rule_trigger": "all | managed_services | hardware_infra | software_dev",\n'
        '  "instruction": "Kalimat aturan imperatif dalam Bahasa Indonesia formal (maksimal 2 kalimat padat)",\n'
        '  "confidence_score": 0.95\n'
        "}"
    )

    provider = get_llm_provider()
    try:
        raw_resp = provider.answer(
            question=prompt,
            context_chunks=[],
            mode="json",
        )
        cleaned = raw_resp.strip()
        if cleaned.startswith("```"):
            import re
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)

        category = str(data.get("category") or "structure_constraint")
        rule_trigger = str(data.get("rule_trigger") or archetype_context or "all")
        instruction = str(data.get("instruction") or feedback_text.strip())
        confidence = float(data.get("confidence_score") or 0.95)
    except Exception as e:
        logger.warning(f"LLM rule distillation failed: {e}. Using direct heuristic rule.")
        category = "structure_constraint" if "panjang" in feedback_text.lower() or "ringkas" in feedback_text.lower() else "content_density"
        rule_trigger = archetype_context if archetype_context in ("managed_services", "hardware_infra", "software_dev") else "all"
        instruction = f"Aturan presales: {feedback_text.strip()}"
        confidence = 0.90

    # Save to database
    rule_id = f"rule-{uuid.uuid4().hex[:10]}"
    rule_obj = PresalesRule(
        id=rule_id,
        workspace_id=workspace_id,
        category=category,
        rule_trigger=rule_trigger,
        instruction=instruction,
        confidence_score=confidence,
        source_feedback=feedback_text[:500],
        times_applied=1,
        is_active=1,
    )
    db.add(rule_obj)
    db.commit()
    db.refresh(rule_obj)
    logger.info(f"Distilled new PresalesRule [{rule_id}]: '{instruction}' (trigger: {rule_trigger})")
    return rule_obj
