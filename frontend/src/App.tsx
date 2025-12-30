import { useState, useEffect } from "react";
import Canvas from "./Canvas";
import type { WorkflowDefinition, Job } from "./types";
import "./App.css";

const API_BASE = "http://localhost:8000";

interface JobState {
  workflowName: string;
  workflowId: string;
  jobId: string;
  job?: Job;
  status?: "running" | "failed" | "not_found";
}

function App() {
  const [jobStates, setJobStates] = useState<JobState[]>([]);
  const [pollId, setPollId] = useState<number | null>(null);

  const handleBuildWorkflows = async (workflows: WorkflowDefinition[]) => {
    if (!workflows.length) {
      alert("No workflows defined. Connect some blocks first.");
      return;
    }

    if (pollId !== null) {
      window.clearInterval(pollId);
      setPollId(null);
    }

    const newJobStates: JobState[] = [];

    for (const wf of workflows) {
      const wfRes = await fetch(`${API_BASE}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wf),
      });
      if (!wfRes.ok) {
        console.error("Failed to create workflow", wf.name);
        continue;
      }
      const wfJson = await wfRes.json();

      const runRes = await fetch(`${API_BASE}/workflows/${wfJson.id}/run`, {
        method: "POST",
      });
      if (!runRes.ok) {
        console.error("Failed to run workflow", wf.name);
        continue;
      }
      const runJson = await runRes.json(); 

      newJobStates.push({
        workflowName: wf.name,
        workflowId: wfJson.id,
        jobId: runJson.job_id,
      });
    }

    if (!newJobStates.length) return;

    setJobStates(newJobStates);  
    let current = newJobStates;

    const id = window.setInterval(async () => {
    const updated = await Promise.all(
    current.map(async (js) => {
        const res = await fetch(`${API_BASE}/jobs/${js.jobId}`);
        if (res.status === 404) return { ...js, status: "not_found" as "not_found" };
        if (!res.ok) return js;
        const data = await res.json();
        const status: "running" | "failed" = data.error_message ? "failed" : "running";
        return {
          ...js,
          job: data,
          status,
        };
      })
    );

    current = updated;
    setJobStates(updated);

    const allDone = updated.every(
      (js) =>
        js.job &&
        (js.job.progress >= 1 || (js.job.error_message ?? "") !== "")
    );

    if (allDone) {
      window.clearInterval(id);
      setPollId(null);
      
      updated.forEach((js) => {
        if (js.job && js.job.progress >= 1 && js.job.output_file && !js.job.error_message) {
          const downloadUrl = `${API_BASE}/jobs/${js.jobId}/download`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = '';  
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      });
    }
    }, 500);

    setPollId(id);
  };

  useEffect(() => {
    return () => {
      if (pollId !== null) window.clearInterval(pollId);
    };
  }, [pollId]);

  return (
    <div className="page">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workflow Studio</p>
            <h1>Canvas-first builder</h1>
            <p className="muted">
              Drag, connect, and run. Job status and workflow summaries float as banners.
            </p>
          </div>
          <div className="topbar__meta">
            <span className="pill">Backend: {API_BASE}</span>
            <span className="pill pill--soft">Live polling 500ms</span>
          </div>
        </header>

        <div className="banner-row">
          {jobStates.length > 0 ? (
            jobStates.map((js) => {
              const progress = js.job ? Math.round(js.job.progress * 100) : 0;
              const error = js.job?.error_message;
              const status =
                js.status === "not_found"
                  ? "Not found"
                  : error
                    ? "Failed"
                    : progress >= 100
                      ? "Completed"
                      : "Running";
              const statusClass =
                js.status === "not_found"
                  ? "pill pill--soft"
                  : error
                    ? "pill pill--danger"
                    : progress >= 100
                      ? "pill pill--success"
                      : "pill pill--soft";

              return (
                <div key={js.jobId} className="banner">
                  <div className="banner__left">
                    <div className="banner__title">{js.workflowName}</div>
                    <div className="banner__sub">Job {js.jobId}</div>
                  </div>
                  <div className="banner__right">
                    <div className="progress progress--sm">
                      <div
                        className={`progress__fill ${error ? "is-error" : ""}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className={statusClass}>{status}</span>
                    {error && <span className="pill pill--danger">Error</span>}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="banner banner--muted">
              No runs yet. Click "Run workflows" to kick off a job.
            </div>
          )}
        </div>

        <section className="canvas-full">
          <Canvas onBuildWorkflows={handleBuildWorkflows} />
        </section>
      </div>
    </div>
  );
}

export default App;
