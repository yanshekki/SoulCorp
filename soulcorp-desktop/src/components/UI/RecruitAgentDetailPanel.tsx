import type { RecruitmentCandidate } from "../../types/game";
import { hubFileTypeLabel } from "../../utils/candidateSoul";
import { SoulMdEditor } from "./SoulMdEditor";

import { useCompanyDepartments } from "../../hooks/useCompanyDepartments";
import { useI18n } from "../../i18n/I18nProvider";

interface RecruitAgentDetailPanelProps {
  candidate: RecruitmentCandidate | null;
  soulLoading: boolean;
  role: string;
  department: string;
  soulMdContent: string;
  /** When provided with onDisplayNameChange, shows an editable name field. */
  displayName?: string;
  onDisplayNameChange?: (name: string) => void;
  /** Hide name field when parent already renders it (default true when handlers exist). */
  showNameField?: boolean;
  onRoleChange: (role: string) => void;
  onDepartmentChange: (department: string) => void;
  onSoulChange: (content: string) => void;
}

export function RecruitAgentDetailPanel({
  candidate,
  soulLoading,
  role,
  department,
  soulMdContent,
  displayName,
  onDisplayNameChange,
  showNameField,
  onRoleChange,
  onDepartmentChange,
  onSoulChange,
}: RecruitAgentDetailPanelProps) {
  const { t } = useI18n();
  const { departmentNames } = useCompanyDepartments();
  const nameEditable = Boolean(onDisplayNameChange);
  const renderNameField =
    showNameField !== false && nameEditable && displayName !== undefined;

  if (!candidate) {
    return (
      <div className="recruit-agent-detail recruit-agent-detail-empty">
        <p className="muted">{t("recruit.emptyHint")}</p>
      </div>
    );
  }

  const headerName = (displayName ?? candidate.name).trim() || candidate.name;

  return (
    <div className="recruit-agent-detail">
      <header className="recruit-agent-detail-header">
        <div>
          <p className="recruit-agent-detail-eyebrow">{t("recruit.selected")}</p>
          <h4>{headerName}</h4>
          <p className="recruit-agent-detail-role">
            {candidate.job_role || candidate.vibe}
            {candidate.department_fit ? ` · ${candidate.department_fit}` : ""}
          </p>
        </div>
        <div className="recruit-agent-detail-badges">
          {hubFileTypeLabel(candidate.file_type) ? (
            <span
              className={`recruit-badge ${candidate.file_type === "full_soul_folder" ? "modular" : "single-md"}`}
            >
              {hubFileTypeLabel(candidate.file_type)}
            </span>
          ) : null}
          {candidate.verified ? <span className="recruit-badge verified">{t("recruitment.verified")}</span> : null}
          {candidate.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="recruit-badge">
              {skill}
            </span>
          ))}
        </div>
      </header>

      <section className="recruit-agent-description">
        <h5>{t("recruit.description")}</h5>
        <p>{candidate.headline || t("recruit.noDesc")}</p>
      </section>

      <div className="agent-roster-recruit-fields recruit-agent-detail-fields">
        {renderNameField ? (
          <label className="field-label">
            {t("recruit.displayName")}
            <input
              type="text"
              value={displayName}
              onChange={(event) => onDisplayNameChange?.(event.target.value)}
              maxLength={64}
              placeholder={t("recruit.namePh")}
            />
          </label>
        ) : null}
        <label className="field-label">
          {t("recruit.role")}
          <input
            type="text"
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
            maxLength={64}
          />
        </label>
        <label className="field-label">
          {t("recruit.department")}
          <select value={department} onChange={(event) => onDepartmentChange(event.target.value)}>
            {departmentNames.length === 0 ? (
              <option value={department}>{department || "—"}</option>
            ) : (
              departmentNames.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <section className="recruit-agent-soul-section">
        <div className="recruit-agent-soul-heading">
          <h5>soul.md</h5>
          {soulLoading ? (
            <span className="recruit-agent-soul-status loading">{t("recruit.soulLoading")}</span>
          ) : (
            <span className="recruit-agent-soul-status ready">{t("recruit.soulEditable")}</span>
          )}
        </div>
        {soulLoading && soulMdContent.trim().length === 0 ? (
          <div className="recruit-agent-soul-skeleton" aria-hidden="true" />
        ) : (
          <SoulMdEditor value={soulMdContent} onChange={onSoulChange} minRows={14} />
        )}
      </section>
    </div>
  );
}
