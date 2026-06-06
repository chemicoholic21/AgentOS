from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import AgentMemory

router = APIRouter()


@router.get("/")
def get_memory(db: Session = Depends(get_db)):
    memories = (
        db.query(AgentMemory)
        .order_by(AgentMemory.agent_name.asc(), AgentMemory.memory_key.asc())
        .all()
    )
    return [
        {
            "id": str(m.id),
            "agent_name": m.agent_name,
            "memory_key": m.memory_key,
            "memory_value": m.memory_value,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in memories
    ]
