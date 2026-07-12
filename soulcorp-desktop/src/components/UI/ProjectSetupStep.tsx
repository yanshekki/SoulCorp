import type { ProjectSetupState } from "../../data/presetProjects";
import { useI18n } from "../../i18n/I18nProvider";

interface ProjectSetupStepProps {
  value: ProjectSetupState;
  onChange: (value: ProjectSetupState) => void;
  companyName?: string;
}

export function ProjectSetupStep({ value, onChange, companyName }: ProjectSetupStepProps) {
  const { t } = useI18n();
  return (
    <section className="onboarding-step project-setup-step">
      <h3>{t("projectSetup.title")}</h3>
      <p className="muted">{t("projectSetup.desc")}</p>

      <div className="project-setup-custom-fields">
        <label className="field-label">
          {t("projectSetup.projectTitle")}
          <input
            type="text"
            value={value.customTitle}
            onChange={(event) => onChange({ ...value, customTitle: event.target.value })}
            maxLength={80}
            placeholder={
              companyName?.trim()
                ? t("projectSetup.projectTitlePh", { name: companyName.trim() })
                : t("projectSetup.projectTitlePhDefault")
            }
          />
        </label>
        <label className="field-label">
          {t("projectSetup.description")}
          <input
            type="text"
            value={value.customDescription}
            onChange={(event) => onChange({ ...value, customDescription: event.target.value })}
            maxLength={200}
            placeholder={t("projectSetup.descriptionPh")}
          />
        </label>
        <label className="field-label">
          {t("projectSetup.department")}
          <input
            type="text"
            value={value.customDepartment}
            onChange={(event) => onChange({ ...value, customDepartment: event.target.value })}
            maxLength={60}
            placeholder={t("projectSetup.departmentPh")}
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