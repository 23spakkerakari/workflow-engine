# api.py
from uuid import uuid4
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware  
from models import (
    WorkFlow,
    Job,
    CreateWorkflowRequest,
    RunWorkflowResponse,
)
from vars import WORKFLOWS, JOBS
from executor import execute_workflow_job

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/workflows", response_model=WorkFlow)
def create_workflow(payload: CreateWorkflowRequest):
    workflow_id = str(uuid4())
    workflow = WorkFlow(
        id=workflow_id,
        name=payload.name,
        blocks=payload.blocks,
    )
    WORKFLOWS[workflow_id] = workflow
    return workflow


@app.get("/workflows/{workflow_id}", response_model=WorkFlow)
def get_workflow(workflow_id: str):
    wf = WORKFLOWS.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@app.post("/workflows/{workflow_id}/run", response_model=RunWorkflowResponse)
def run_workflow(workflow_id: str, background_tasks: BackgroundTasks):
    wf = WORKFLOWS.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    job_id = str(uuid4())
    job = Job(
        id=job_id,
        workflow_id=workflow_id,
        progress=0.0,
    )
    JOBS[job_id] = job

    background_tasks.add_task(execute_workflow_job, job_id)

    return RunWorkflowResponse(job_id=job_id)


@app.get("/jobs/{job_id}", response_model=Job)
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
