import type { ProjectSetupState } from "../../data/presetProjects";

interface ProjectSetupStepProps {
  value: ProjectSetupState;
  onChange: (value: ProjectSetupState) => void;
  companyName?: string;
}

export function ProjectSetupStep({ value, onChange, companyName }: ProjectSetupStepProps) {
  return (
    <section className="onboarding-step project-setup-step">
      <h3>First project</h3>
      <p className="muted">
        Name your first project. Backlog, sprints, and tasks start empty — you define everything on
        the Projects page.
      </p>

      <div className="project-setup-custom-fields">
        <label className="field-label">
          Project title
          <input
            type="text"
            value={value.customTitle}
            onChange={(event) => onChange({ ...value, customTitle: event.target.value })}
            maxLength={80}
            placeholder={
              companyName?.trim() ? `e.g. ${companyName.trim()} — Flagship` : "e.g. Q3 Product Launch"
            }
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
          <input
            type="text"
            value={value.customDepartment}
            onChange={(event) => onChange({ ...value, customDepartment: event.target.value })}
            maxLength={60}
            placeholder="Optional — e.g. Engineering"
          />
        </label>
      </div>
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