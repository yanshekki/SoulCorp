import { invoke } from "../utils/tauriInvoke";
import { audioDirector } from "../audio/AudioDirector";
import { useEffect, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { totalCompanyTokens } from "../utils/companyState";
import { openAgentWorkspace, openDepartmentWorkspace } from "../utils/openWorkspacePage";
import type { InternalProject } from "../types/game";
import { useI18n } from "../i18n/I18nProvider";

export function BuildingModal() {
  const { t } = useI18n();
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);
  const worldView = useGameStore((state) => state.worldView);
  const selectBuilding = useGameStore((state) => state.selectBuilding);
  const enterInterior = useGameStore((state) => state.enterInterior);
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

  if (!selectedBuilding || worldView === "interior") {
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
            {t("building.backToCampus")}
          </button>
        </header>
        <p>{selectedBuilding.description}</p>
        <p className="muted building-zoom-hint">
          {t("building.zoomHint")}
        </p>

        <div className="building-modal-actions">
          <button
            type="button"
            className="primary-action building-enter-btn"
            onClick={() => {
              audioDirector.unlock();
              audioDirector.playSfx("door_open");
              window.setTimeout(() => audioDirector.playSfx("camera_whoosh"), 120);
              enterInterior(selectedBuilding.id);
            }}
          >
            {t("building.enterBuilding")}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() =>
              void openDepartmentWorkspace(
                selectedBuilding.department,
                `${selectedBuilding.name} docs`,
              )
            }
          >
            {t("building.openDeptWorkspace")}
          </button>
        </div>

        <section className="building-stats-grid">
          <article>
            <span>{t("building.agents")}</span>
            <strong>{departmentRecords.length}</strong>
          </article>
          <article>
            <span>{t("building.workingNow")}</span>
            <strong>{workingAgents}</strong>
          </article>
          <article>
            <span>{t("building.avgMorale")}</span>
            <strong>{(avgMorale * 100).toFixed(0)}%</strong>
          </article>
          <article>
            <span>{t("building.activeProjects")}</span>
            <strong>{projectsError ? "—" : activeProjects}</strong>
          </article>
          <article>
            <span>{t("building.companyTokens")}</span>
            <strong>{totalCompanyTokens(finance).toLocaleString()}</strong>
          </article>
        </section>

        {projectsError ? (
          <p className="hub-warning" role="status">
            {t("building.projectsLoadError", { error: projectsError })}
          </p>
        ) : null}

        <section>
          <h3>{t("building.agentsInArea")}</h3>
          {departmentRecords.length === 0 ? (
            <p className="muted">{t("building.noAgents")}</p>
          ) : (
            <ul>
              {departmentRecords.map((record) => {
                const visual = departmentAgents.find((agent) => agent.id === record.id);
                return (
                  <li key={record.id} className="building-agent-row">
                    <span>
                      <strong>{record.name}</strong> — {record.role} (
                      {visual?.statusLabel ?? record.status}) · morale{" "}
                      {(record.morale * 100).toFixed(0)}%
                    </span>
                    <button
                      type="button"
                      className="building-agent-workspace-link"
                      onClick={() => void openAgentWorkspace(record.id, record.name)}
                    >
                      {t("building.workspace")}
                    </button>
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