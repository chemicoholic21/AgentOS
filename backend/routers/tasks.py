from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Task, ActivityLog

router = APIRouter()


class CreateTask(BaseModel):
    title: str
    description: Optional[str] = ""
    assigned_to: Optional[str] = "agent_outreach"


class RespondToTask(BaseModel):
    response: str
    action: str  # "approve" | "reject" | "respond"


@router.get("/")
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).order_by(Task.created_at.asc()).all()
    return [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "assigned_to": t.assigned_to,
            "block_reason": t.block_reason,
            "block_question": t.block_question,
            "output": t.output,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tasks
    ]


@router.post("/")
def create_task(body: CreateTask, db: Session = Depends(get_db)):
    task = Task(
        title=body.title,
        description=body.description,
        status="BACKLOG",
        assigned_to=body.assigned_to,
    )
    db.add(task)
    db.commit()
    return {"id": str(task.id), "status": "created"}


@router.post("/{task_id}/respond")
def respond(
    task_id: str, body: RespondToTask, db: Session = Depends(get_db)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return {"error": "Not found"}

    if body.action == "approve":
        task.status = "APPROVED"
        task.human_response = body.response
    elif body.action == "reject":
        task.status = "COMPLETED"
        task.output = f"Rejected: {body.response}"
    elif body.action == "respond":
        task.status = "APPROVED"
        task.human_response = body.response

    db.add(
        ActivityLog(
            task_id=task.id,
            agent_name="human",
            action=body.action.upper(),
            detail=body.response,
        )
    )
    db.commit()
    return {"status": "updated"}
