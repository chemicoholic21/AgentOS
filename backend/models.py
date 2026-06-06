from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()


class Application(Base):
    __tablename__ = "applications"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applicant_name = Column(Text, nullable=False)
    raw_text = Column(Text, nullable=False)
    status = Column(String, default="PENDING")
    score = Column(Integer)
    agent_reasoning = Column(Text)
    human_note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    description = Column(Text)
    status = Column(String, default="BACKLOG")
    assigned_to = Column(Text, nullable=False)
    parent_task_id = Column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )
    block_reason = Column(Text)
    block_question = Column(Text)
    human_response = Column(Text)
    output = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"))
    agent_name = Column(Text)
    action = Column(Text, nullable=False)
    detail = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentMemory(Base):
    __tablename__ = "agent_memory"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_name = Column(Text, nullable=False)
    memory_key = Column(Text, nullable=False)
    memory_value = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
