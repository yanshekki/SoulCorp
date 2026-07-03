import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { quickTagsForPreset } from "../../data/recruitmentSearchTags";
import type { RecruitmentCandidate } from "../../types/game";
import { hubFileTypeLabel } from "../../utils/candidateSoul";

const PAGE_SIZE = 4;
const SEARCH_DEBOUNCE_MS = 320;

interface RecruitmentCandidatePickerProps {
  presetId: string;
  selectedCandidateId: string | null;
  onSelect: (candidate: RecruitmentCandidate) => void;
}

export function RecruitmentCandidatePicker({
  presetId,
  selectedCandidateId,
  onSelect,
}: RecruitmentCandidatePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const quickTags = useMemo(() => quickTagsForPreset(presetId), [presetId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, presetId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await invoke<{
          candidates: RecruitmentCandidate[];
          from_cache: boolean;
          message?: string | null;
        }>("list_recruitment_candidates", {
          query: debouncedQuery || null,
        });
        if (cancelled) {
          return;
        }
        setCandidates(result.candidates);
        setMessage(
          result.message ??
            (result.from_cache
              ? `Cached hub results${debouncedQuery ? ` for “${debouncedQuery}”` : ""}.`
              : debouncedQuery
                ? `Results for “${debouncedQuery}”.`
                : "Search or tap a tag to browse hub souls."),
        );
      } catch (error) {
        if (!cancelled) {
          setCandidates([]);
          setMessage(String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || query === debouncedQuery.toLowerCase()) {
      return candidates;
    }
    return candidates.filter(
      (candidate) =>
        candidate.name.toLowerCase().includes(query) ||
        candidate.headline.toLowerCase().includes(query) ||
        candidate.job_role.toLowerCase().includes(query) ||
        candidate.vibe.toLowerCase().includes(query) ||
        candidate.skills.some((skill) => skill.toLowerCase().includes(query)),
    );
  }, [candidates, debouncedQuery, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageCandidates = filteredCandidates.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const applyTag = (tag: string) => {
    setActiveTag(tag);
    setSearchQuery(tag);
  };

  return (
    <div className="recruitment-candidate-picker">
      <div className="recruitment-candidate-picker-toolbar">
        <label className="field-label recruitment-candidate-picker-search">
          Search hub souls
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setActiveTag(null);
              setSearchQuery(event.target.value);
            }}
            placeholder="Name, skill, description…"
            autoComplete="off"
          />
        </label>
        <span className="recruitment-candidate-picker-count">
          {filteredCandidates.length} results
        </span>
      </div>

      <div className="recruitment-candidate-picker-tags">
        <span className="recruitment-candidate-picker-tags-label muted">Quick tags</span>
        <div className="skill-tags recruitment-quick-tags">
          {quickTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`recruitment-quick-tag ${activeTag === tag ? "active" : ""}`}
              onClick={() => applyTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <p className="recruitment-candidate-picker-status muted">
        {loading ? "Searching soulmd-hub…" : message}
      </p>

      {pageCandidates.length === 0 ? (
        <p className="muted recruitment-candidate-picker-empty">
          {loading ? "Loading…" : "No candidates match this search."}
        </p>
      ) : (
        <>
          <div className="recruit-hub-card-grid">
            {pageCandidates.map((candidate) => {
              const selected = selectedCandidateId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={`recruit-hub-card ${selected ? "selected" : ""}`}
                  onClick={() => onSelect(candidate)}
                >
                  <header className="recruit-hub-card-header">
                    <div className="recruit-hub-card-title-row">
                      <strong>{candidate.name}</strong>
                      {hubFileTypeLabel(candidate.file_type) ? (
                        <span
                          className={`recruit-hub-type-badge ${candidate.file_type === "full_soul_folder" ? "modular" : "single-md"}`}
                        >
                          {hubFileTypeLabel(candidate.file_type)}
                        </span>
                      ) : null}
                    </div>
                    <span className="recruit-hub-card-role">{candidate.job_role || candidate.vibe}</span>
                  </header>
                  <p className="recruit-hub-card-description">{candidate.headline}</p>
                  <footer className="recruit-hub-card-footer">
                    <span>{candidate.department_fit ?? "Flexible dept"}</span>
                    {candidate.verified ? <span className="recruit-hub-verified">Verified</span> : null}
                  </footer>
                  {candidate.skills.length > 0 ? (
                    <div className="skill-tags recruit-hub-card-tags">
                      {candidate.skills.slice(0, 3).map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="recruitment-candidate-picker-pagination">
            <button
              type="button"
              disabled={safePage <= 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1 || loading}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}