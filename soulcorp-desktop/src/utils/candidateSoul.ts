import { invoke } from "./tauriInvoke";
import type { HubSoulImportResult, RecruitmentCandidate } from "../types/game";
import { blankSoulScaffold } from "./departmentSoulTemplates";

export function hubFileTypeLabel(fileType?: string | null): string | null {
  if (fileType === "full_soul_folder") {
    return "Modular";
  }
  if (fileType === "single_md") {
    return "Single .md";
  }
  return null;
}

export function isCustomHireCandidate(candidate: RecruitmentCandidate | null | undefined): boolean {
  return Boolean(candidate?.id.startsWith("custom-"));
}

export function isHubCandidate(candidate: RecruitmentCandidate | null | undefined): boolean {
  return Boolean(candidate?.id.startsWith("hub-soul-"));
}

/** Local draft candidate for HR self-hire (no hub listing required). */
export function buildCustomHireCandidate(params: {
  name?: string;
  role?: string;
  department?: string;
  soulMdContent?: string;
}): RecruitmentCandidate {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `custom-${crypto.randomUUID()}`
      : `custom-${Date.now()}`;
  const name = params.name?.trim() || "New Hire";
  const role = params.role?.trim() || "Specialist";
  const department = params.department?.trim() || "Engineering";
  const soul =
    params.soulMdContent?.trim() ||
    blankSoulScaffold({ name, role, department });

  return {
    id,
    soul_id: null,
    name,
    headline: `Custom hire for ${department}`,
    job_role: role,
    skills: [role.toLowerCase(), department.toLowerCase()].filter(Boolean),
    vibe: "custom",
    verified: false,
    hourly_rate_usdt: 35,
    soul_md_content: soul,
    file_type: "single_md",
    compatibility_score: null,
    skill_overlap: null,
    department_fit: department,
    projected_morale_delta: null,
  };
}

export function buildSoulDraftFromCandidate(candidate: RecruitmentCandidate): string {
  if (candidate.soul_md_content?.trim()) {
    return candidate.soul_md_content;
  }

  const name = candidate.name.trim() || "Unnamed Agent";
  const personality =
    candidate.headline.trim() ||
    `${candidate.job_role || candidate.vibe || "A focused"} specialist from soulmd-hub.`;
  const values =
    candidate.skills.length > 0
      ? candidate.skills.join(", ")
      : candidate.job_role || "Collaboration, quality, clarity";
  const communication = candidate.vibe
    ? `Communicates with a ${candidate.vibe} tone aligned to ${candidate.job_role || "their role"}.`
    : `Clear, professional communication suited to ${candidate.job_role || "the team"}.`;

  return `# ${name}

## Personality
${personality}

## Values
${values}

## Communication Style
${communication}
`;
}

export interface ResolvedCandidateSoul {
  displayMd: string;
  systemPromptSource: string | null;
  fileType: string | null;
}

export function resolvedSoulFromImport(result: HubSoulImportResult): ResolvedCandidateSoul {
  return {
    displayMd: result.display_md,
    systemPromptSource: result.system_prompt || null,
    fileType: result.file_type || null,
  };
}

export async function resolveCandidateSoul(
  candidate: RecruitmentCandidate,
): Promise<ResolvedCandidateSoul> {
  // Local seed / custom / non-hub: use embedded soul.md when present.
  if (!candidate.id.startsWith("hub-soul-")) {
    const displayMd = buildSoulDraftFromCandidate(candidate);
    return {
      displayMd,
      systemPromptSource: null,
      fileType: candidate.file_type ?? null,
    };
  }

  try {
    const result = await invoke<HubSoulImportResult>("fetch_recruitment_candidate_soul", {
      candidateId: candidate.id,
    });
    return resolvedSoulFromImport(result);
  } catch {
    return {
      displayMd: buildSoulDraftFromCandidate(candidate),
      systemPromptSource: null,
      fileType: candidate.file_type ?? null,
    };
  }
}

export async function resolveCandidateSoulMd(
  candidate: RecruitmentCandidate,
): Promise<string> {
  const resolved = await resolveCandidateSoul(candidate);
  return resolved.displayMd;
}