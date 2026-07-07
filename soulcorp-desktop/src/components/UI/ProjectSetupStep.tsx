import {
  PRESET_PROJECTS,
  type ProjectSetupState,
} from "../../data/presetProjects";

import { FALLBACK_DEPARTMENTS } from "../../data/defaultDepartments";

interface ProjectSetupStepProps {
  value: ProjectSetupState;
  onChange: (value: ProjectSetupState) => void;
  companyName?: string;
}

export function ProjectSetupStep({ value, onChange, companyName }: ProjectSetupStepProps) {
  const setMode = (mode: ProjectSetupState["mode"]) => {
    onChange({
      ...value,
      mode,
      customTitle:
        mode === "custom" && value.customTitle.trim().length === 0 && companyName?.trim()
          ? `${companyName.trim()} — Flagship`
          : value.customTitle,
    });
  };

  return (
    <section className="onboarding-step project-setup-step">
      <h3>First projects</h3>
      <p className="muted">
        Choose starter projects for backlog and sprint board. Preset includes demo work items;
        custom starts with an empty backlog you define on the Projects page.
      </p>

      <div className="onboarding-choice-grid agent-roster-mode-grid">
        <button
          type="button"
          className={`onboarding-choice ${value.mode === "preset" ? "selected" : ""}`}
          onClick={() => setMode("preset")}
        >
          <strong>Use preset projects</strong>
          <span>Two ready-made projects plus a starter backlog story.</span>
        </button>
        <button
          type="button"
          className={`onboarding-choice ${value.mode === "custom" ? "selected" : ""}`}
          onClick={() => setMode("custom")}
        >
          <strong>Create your own project</strong>
          <span>One empty project — you add backlog and sprints yourself.</span>
        </button>
      </div>

      {value.mode === "preset" ? (
        <ul className="project-setup-preset-list">
          {PRESET_PROJECTS.map((project) => (
            <li key={project.id} className="project-setup-preset-card">
              <strong>{project.title}</strong>
              <span className="muted">
                {project.department} · {project.description}
              </span>
            </li>
          ))}
          <li className="project-setup-preset-note muted">
            Includes a demo story on Core Platform for the sprint board.
          </li>
        </ul>
      ) : (
        <div className="project-setup-custom-fields">
          <label className="field-label">
            Project title
            <input
              type="text"
              value={value.customTitle}
              onChange={(event) => onChange({ ...value, customTitle: event.target.value })}
              maxLength={80}
              placeholder="e.g. Q3 Product Launch"
            />
          </label>
          <label className="field-label">
            Description
            <input
              type="text"
              value={value.customDescription}
              onChange={(event) => onChange({ ...value, customDescription: event.target.value })}
              maxLength={200}
              placeholder="What is this project trying to deliver?"
            />
          </label>
          <label className="field-label">
            Owner department
            <select
              value={value.customDepartment}
              onChange={(event) => onChange({ ...value, customDepartment: event.target.value })}
            >
              {FALLBACK_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

export {
  isProjectSetupValid,
  defaultProjectSetupState,
  toProjectSetupPayload,
  type ProjectSetupState,
  type ProjectSetupMode,
} from "../../data/presetProjects";