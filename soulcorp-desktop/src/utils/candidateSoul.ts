import { invoke } from "@tauri-apps/api/core";
import type { HubSoulImportResult, RecruitmentCandidate } from "../types/game";

export function hubFileTypeLabel(fileType?: string | null): string | null {
  if (fileType === "full_soul_folder") {
    return "Modular";
  }
  if (fileType === "single_md") {
    return "Single .md";
  }
  return null;
}

export function buildSoulDraftFromCandidate(candidate: RecruitmentCandidate): string {
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