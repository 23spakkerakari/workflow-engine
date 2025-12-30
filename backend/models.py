# models.py
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid

class BlockType(str, Enum):
    READ_CSV = "read_csv"
    LEAD_ENRICHMENT = "lead_enrichment"
    FILTER = "filter"
    FIND_EMAIL = "find_email"
    EXPORT_CSV = "export_csv"

class Block(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: BlockType
    parameters: Dict[str, Any] = Field(default_factory=dict)

class WorkFlow(BaseModel):
    id: str
    name: str
    blocks: List[Block]

class Job(BaseModel):
    id: str
    workflow_id: str
    progress: float = 0.0
    error_message: Optional[str] = None 

class CreateWorkflowRequest(BaseModel):
    name: str
    blocks: List[Block]

class RunWorkflowResponse(BaseModel):
    job_id: str

