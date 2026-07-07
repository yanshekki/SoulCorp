import type { RecruitmentCandidate } from "../../types/game";
import { hubFileTypeLabel } from "../../utils/candidateSoul";
import { SoulMdEditor } from "./SoulMdEditor";

import { useCompanyDepartments } from "../../hooks/useCompanyDepartments";

interface RecruitAgentDetailPanelProps {
  candidate: RecruitmentCandidate | null;
  soulLoading: boolean;
  role: string;
  department: string;
  soulMdContent: string;
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
  onRoleChange,
  onDepartmentChange,
  onSoulChange,
}: RecruitAgentDetailPanelProps) {
  const { departmentNames } = useCompanyDepartments();

  if (!candidate) {
    return (
      <div className="recruit-agent-detail recruit-agent-detail-empty">
        <p className="muted">Select a hub candidate above to preview their description and soul.md.</p>
      </div>
    );
  }

  return (
    <div className="recruit-agent-detail">
      <header className="recruit-agent-detail-header">
        <div>
          <p className="recruit-agent-detail-eyebrow">Selected recruit</p>
          <h4>{candidate.name}</h4>
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
          {candidate.verified ? <span className="recruit-badge verified">Verified</span> : null}
          {candidate.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="recruit-badge">
              {skill}
            </span>
          ))}
        </div>
      </header>

      <section className="recruit-agent-description">
        <h5>Description</h5>
        <p>{candidate.headline || "No hub description provided for this soul."}</p>
      </section>

      <div className="agent-roster-recruit-fields recruit-agent-detail-fields">
        <label className="field-label">
          Default role
          <input
            type="text"
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
            maxLength={64}
          />
        </label>
        <label className="field-label">
          Default department
          <select value={department} onChange={(event) => onDepartmentChange(event.target.value)}>
            {departmentNames.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="recruit-agent-soul-section">
        <div className="recruit-agent-soul-heading">
          <h5>soul.md</h5>
          {soulLoading ? (
            <span className="recruit-agent-soul-status loading">Loading from hub…</span>
          ) : (
            <span className="recruit-agent-soul-status ready">Editable before join</span>
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