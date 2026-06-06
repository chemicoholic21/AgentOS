from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import ActivityLog

router = APIRouter()


@router.get("/")
def get_logs(db: Session = Depends(get_db)):
    logs = (
        db.query(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": str(log.id),
            "task_id": str(log.task_id) if log.task_id else None,
            "agent_name": log.agent_name,
            "action": log.action,
            "detail": log.detail,
            "created_at": log.created_at.isoformat()
            if log.created_at
            else None,
        }
        for log in logs
    ]
