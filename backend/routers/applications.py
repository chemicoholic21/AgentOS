from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Application, Task

router = APIRouter()


class SubmitApplication(BaseModel):
    applicant_name: str
    raw_text: str


class HumanDecision(BaseModel):
    decision: str  # "APPROVED" | "REJECTED"
    note: Optional[str] = ""


@router.get("/")
def get_applications(db: Session = Depends(get_db)):
    apps = db.query(Application).order_by(Application.created_at.desc()).all()
    return [
        {
            "id": str(a.id),
            "applicant_name": a.applicant_name,
            "raw_text": a.raw_text,
            "status": a.status,
            "score": a.score,
            "agent_reasoning": a.agent_reasoning,
            "human_note": a.human_note,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in apps
    ]


@router.post("/")
def submit_application(
    body: SubmitApplication, db: Session = Depends(get_db)
):
    app = Application(
        applicant_name=body.applicant_name,
        raw_text=body.raw_text,
        status="PENDING",
    )
    db.add(app)
    db.commit()
    app_id = str(app.id)

    # Create screening task — description holds app_id
    task = Task(
        title=f"Screen: {body.applicant_name}",
        description=app_id,
        status="BACKLOG",
        assigned_to="agent_screening",
    )
    db.add(task)
    db.commit()

    return {"id": app_id, "status": "queued for screening"}


@router.post("/{app_id}/decide")
def human_decide(
    app_id: str, body: HumanDecision, db: Session = Depends(get_db)
):
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        return {"error": "Not found"}
    app.status = body.decision
    app.human_note = body.note
    db.commit()
    return {"status": "updated"}
