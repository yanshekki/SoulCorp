import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { totalCompanyTokens } from "../utils/companyState";
import type { InternalProject } from "../types/game";

export function BuildingModal() {
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);
  const selectBuilding = useGameStore((state) => state.selectBuilding);
  const agents = useGameStore((state) => state.agents);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const finance = useGameStore((state) => state.finance);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  useEffect(() => {
    setProjectsError(null);
    void invoke<InternalProject[]>("list_internal_projects")
      .then((result) => {
        setProjects(result);
        setProjectsError(null);
      })
      .catch((error) => {
        setProjects([]);
        const message = String(error);
        setProjectsError(message);
        setStatusMessage(message);
      });
  }, [selectedBuilding?.id, setStatusMessage]);

  if (!selectedBuilding) {
    return null;
  }

  const departmentRecords = agentRecords.filter(
    (record) => record.department === selectedBuilding.department,
  );
  const departmentAgents = agents.filter((agent) =>
    departmentRecords.some((record) => record.id === agent.id),
  );
  const avgMorale =
    departmentRecords.length === 0
      ? 0
      : departmentRecords.reduce((sum, record) => sum + record.morale, 0) /
        departmentRecords.length;
  const activeProjects = projects.filter((project) => project.progress < 1).length;
  const workingAgents = departmentAgents.filter(
    (agent) => agent.status === "working" || agent.status === "meeting",
  ).length;
  return (
    <div className="building-modal-overlay" role="dialog" aria-modal="true">
      <div className="building-modal">
        <header>
          <div>
            <p className="modal-eyebrow">{selectedBuilding.department}</p>
            <h2>{selectedBuilding.name}</h2>
          </div>
          <button type="button" onClick={() => selectBuilding(null)}>
            Back to campus
          </button>
        </header>
        <p>{selectedBuilding.description}</p>
        <p className="muted building-zoom-hint">
          Camera zoomed to this building. Click the building again or use Back to campus to reset
          the view.
        </p>

        <section className="building-stats-grid">
          <article>
            <span>Agents</span>
            <strong>{departmentRecords.length}</strong>
          </article>
          <article>
            <span>Working now</span>
            <strong>{workingAgents}</strong>
          </article>
          <article>
            <span>Avg morale</span>
            <strong>{(avgMorale * 100).toFixed(0)}%</strong>
          </article>
          <article>
            <span>Active projects</span>
            <strong>{projectsError ? "—" : activeProjects}</strong>
          </article>
          <article>
            <span>Company tokens</span>
            <strong>{totalCompanyTokens(finance).toLocaleString()}</strong>
          </article>
        </section>

        {projectsError ? (
          <p className="hub-warning" role="status">
            Could not load projects: {projectsError}
          </p>
        ) : null}

        <section>
          <h3>Agents in this area</h3>
          {departmentRecords.length === 0 ? (
            <p className="muted">No agents assigned yet.</p>
          ) : (
            <ul>
              {departmentRecords.map((record) => {
                const visual = departmentAgents.find((agent) => agent.id === record.id);
                return (
                  <li key={record.id}>
                    <strong>{record.name}</strong> — {record.role} (
                    {visual?.statusLabel ?? record.status}) · morale{" "}
                    {(record.morale * 100).toFixed(0)}%
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}