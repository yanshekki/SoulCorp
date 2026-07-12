import { useCallback, useMemo, useRef, useState } from "react";
import {
  defaultAgentRosterState,
  presetForId,
  type AgentRosterSlotState,
} from "../../data/presetAgents";
import type { AgentSlotMode, RecruitmentCandidate } from "../../types/game";
import {
  buildSoulDraftFromCandidate,
  resolveCandidateSoul,
} from "../../utils/candidateSoul";
import { validateSoulMd } from "../../utils/soulMdValidation";
import { RecruitAgentDetailPanel } from "./RecruitAgentDetailPanel";
import { RecruitmentCandidatePicker } from "./RecruitmentCandidatePicker";
import { SoulMdEditor } from "./SoulMdEditor";
import { useI18n } from "../../i18n/I18nProvider";

interface AgentRosterStepProps {
  pureLocalMode: boolean;
  value: AgentRosterSlotState[];
  onChange: (value: AgentRosterSlotState[]) => void;
}

export function isAgentRosterValid(slots: AgentRosterSlotState[], pureLocalMode: boolean): boolean {
  return slots.every((slot) => {
    if (slot.mode === "preset") {
      return validateSoulMd(slot.soul_md_content).valid;
    }
    if (pureLocalMode) {
      return (
        validateSoulMd(slot.soul_md_content).valid &&
        slot.role.trim().length > 0 &&
        slot.department.trim().length > 0
      );
    }
    return (
      slot.candidate_id != null &&
      slot.candidate_id.trim().length > 0 &&
      validateSoulMd(slot.soul_md_content).valid &&
      slot.role.trim().length > 0 &&
      slot.department.trim().length > 0
    );
  });
}

export function AgentRosterStep({ pureLocalMode, value, onChange }: AgentRosterStepProps) {
  const { t } = useI18n();
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, RecruitmentCandidate | null>
  >({});
  const [soulLoadingSlots, setSoulLoadingSlots] = useState<Record<string, boolean>>({});
  const valueRef = useRef(value);
  valueRef.current = value;

  const updateSlot = useCallback((presetId: string, patch: Partial<AgentRosterSlotState>) => {
    onChange(
      valueRef.current.map((slot) =>
        slot.preset_id === presetId ? { ...slot, ...patch } : slot,
      ),
    );
  }, [onChange]);

  const setMode = (presetId: string, mode: AgentSlotMode) => {
    const preset = presetForId(presetId);
    if (!preset) {
      return;
    }
    setSelectedCandidates((current) => ({ ...current, [presetId]: null }));
    setSoulLoadingSlots((current) => ({ ...current, [presetId]: false }));
    updateSlot(presetId, {
      mode,
      soul_md_content: preset.defaultSoulMd,
      candidate_id: null,
      role: preset.role,
      department: preset.department,
      offered_salary: null,
      system_prompt_source: null,
      soul_md_edited: false,
    });
  };

  const handleRecruitSoulChange = (presetId: string, content: string) => {
    updateSlot(presetId, {
      soul_md_content: content,
      system_prompt_source: null,
      soul_md_edited: true,
    });
  };

  const selectCandidate = useCallback(
    async (presetId: string, candidate: RecruitmentCandidate) => {
      const preset = presetForId(presetId);
      const monthlySalary = Math.round(candidate.hourly_rate_usdt * 160) || 3500;
      const draftSoul = buildSoulDraftFromCandidate(candidate);

      setSelectedCandidates((current) => ({ ...current, [presetId]: candidate }));
      setSoulLoadingSlots((current) => ({ ...current, [presetId]: true }));
      updateSlot(presetId, {
        mode: "recruit",
        candidate_id: candidate.id,
        soul_md_content: draftSoul,
        role: preset?.role ?? "",
        department: preset?.department ?? "Engineering",
        offered_salary: monthlySalary,
        system_prompt_source: null,
        soul_md_edited: false,
      });

      try {
        const resolvedSoul = await resolveCandidateSoul(candidate);
        updateSlot(presetId, {
          soul_md_content: resolvedSoul.displayMd,
          system_prompt_source: resolvedSoul.systemPromptSource,
          soul_md_edited: false,
        });
      } finally {
        setSoulLoadingSlots((current) => ({ ...current, [presetId]: false }));
      }
    },
    [updateSlot],
  );

  const rosterValid = useMemo(
    () => isAgentRosterValid(value, pureLocalMode),
    [value, pureLocalMode],
  );

  return (
    <section className="onboarding-step agent-roster-step">
      <h3>{t("roster.title")}</h3>
      <p className="muted">{t("roster.desc")}</p>

      <div className="agent-roster-grid">
        {value.map((slot) => {
          const preset = presetForId(slot.preset_id);
          if (!preset) {
            return null;
          }
          const selectedCandidate = selectedCandidates[slot.preset_id] ?? null;
          const soulLoading = Boolean(soulLoadingSlots[slot.preset_id]);

          return (
            <article key={slot.preset_id} className="agent-roster-card">
              <header className="agent-roster-card-header">
                <div>
                  <h4>{t("roster.slot", { name: preset.name })}</h4>
                  <p className="muted">
                    {t("roster.default", { role: preset.role, department: preset.department })}
                  </p>
                </div>
                <p className="agent-roster-summary">{preset.summary}</p>
              </header>

              <div className="onboarding-choice-grid agent-roster-mode-grid">
                <button
                  type="button"
                  className={`onboarding-choice ${slot.mode === "preset" ? "selected" : ""}`}
                  onClick={() => setMode(slot.preset_id, "preset")}
                >
                  <strong>{t("roster.usePreset")}</strong>
                  <span>{t("roster.usePresetDesc", { name: preset.name })}</span>
                </button>
                <button
                  type="button"
                  className={`onboarding-choice ${slot.mode === "recruit" ? "selected" : ""}`}
                  onClick={() => setMode(slot.preset_id, "recruit")}
                >
                  <strong>{t("roster.recruitHub")}</strong>
                  <span>
                    {pureLocalMode
                      ? t("roster.recruitLocal")
                      : t("roster.recruitBrowse")}
                  </span>
                </button>
              </div>

              {slot.mode === "preset" ? (
                <SoulMdEditor
                  value={slot.soul_md_content}
                  onChange={(content) => updateSlot(slot.preset_id, { soul_md_content: content })}
                />
              ) : (
                <div className="agent-roster-recruit-layout">
                  {!pureLocalMode ? (
                    <>
                      <RecruitmentCandidatePicker
                        presetId={slot.preset_id}
                        selectedCandidateId={slot.candidate_id}
                        onSelect={(candidate) => void selectCandidate(slot.preset_id, candidate)}
                      />
                      <RecruitAgentDetailPanel
                        candidate={selectedCandidate}
                        soulLoading={soulLoading}
                        role={slot.role}
                        department={slot.department}
                        soulMdContent={slot.soul_md_content}
                        onRoleChange={(role) => updateSlot(slot.preset_id, { role })}
                        onDepartmentChange={(department) =>
                          updateSlot(slot.preset_id, { department })
                        }
                        onSoulChange={(content) =>
                          handleRecruitSoulChange(slot.preset_id, content)
                        }
                      />
                    </>
                  ) : (
                    <div className="recruit-agent-detail">
                      <p className="muted">{t("roster.pureLocal")}</p>
                      <div className="agent-roster-recruit-fields">
                        <label className="field-label">
                          {t("roster.role")}
                          <input
                            type="text"
                            value={slot.role}
                            onChange={(event) =>
                              updateSlot(slot.preset_id, { role: event.target.value })
                            }
                            maxLength={64}
                          />
                        </label>
                        <label className="field-label">
                          {t("roster.department")}
                          <select
                            value={slot.department}
                            onChange={(event) =>
                              updateSlot(slot.preset_id, { department: event.target.value })
                            }
                          >
                            {["Engineering", "Human Resources", "Executive", "Marketplace"].map(
                              (department) => (
                                <option key={department} value={department}>
                                  {department}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <SoulMdEditor
                        value={slot.soul_md_content}
                        onChange={(content) =>
                          updateSlot(slot.preset_id, { soul_md_content: content })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!rosterValid ? (
        <p className="agent-roster-hint muted">{t("roster.incomplete")}</p>
      ) : (
        <p className="agent-roster-hint valid-copy">{t("roster.ready")}</p>
      )}
    </section>
  );
}

export { defaultAgentRosterState };