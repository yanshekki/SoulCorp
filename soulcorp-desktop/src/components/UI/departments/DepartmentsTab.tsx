import { useMemo, useState } from "react";
import { useGameStore } from "../../../stores/gameStore";
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
  updateDepartment,
} from "../../../services/departmentsClient";
import type { DepartmentListEntry } from "../../../types/game";
import { DEPARTMENT_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import { useI18n } from "../../../i18n/I18nProvider";
import { SearchField } from "../SearchField";
import { DepartmentEditor } from "./DepartmentEditor";
import {
  departmentAccentStyle,
  departmentFormFromEntry,
  EMPTY_DEPARTMENT_FORM,
  normalizeHexColor,
  type DepartmentFormState,
} from "./departmentUtils";

interface DepartmentsTabProps {
  departments: DepartmentListEntry[];
  onChanged: () => Promise<void>;
  createMode: boolean;
  onCreateModeChange: (value: boolean) => void;
  onGenerateOrg?: () => void;
  generating?: boolean;
}

export function DepartmentsTab({
  departments,
  onChanged,
  createMode,
  onCreateModeChange,
  onGenerateOrg,
  generating = false,
}: DepartmentsTabProps) {
  const { t } = useI18n();
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [createForm, setCreateForm] = useState<DepartmentFormState>(EMPTY_DEPARTMENT_FORM);
  const [editForm, setEditForm] = useState<DepartmentFormState>(EMPTY_DEPARTMENT_FORM);

  const filtered = useMemo(
    () =>
      filterByScopedQuery(departments, query, searchType, {
        all: (department) => [
          department.name,
          department.display_name,
          department.sop,
          department.head_agent_name ?? "",
        ],
        department: (department) => [department.name, department.display_name, department.sop],
        agent: (department) => [department.head_agent_name ?? ""],
      }),
    [departments, query, searchType],
  );

  const selected = departments.find((department) => department.id === selectedId) ?? null;

  const transferOptions = useMemo(
    () => departments.filter((department) => department.id !== selectedId),
    [departments, selectedId],
  );

  const openDepartment = (department: DepartmentListEntry) => {
    onCreateModeChange(false);
    setShowDeleteConfirm(false);
    setSelectedId(department.id);
    setEditForm(departmentFormFromEntry(department));
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createDepartment({
        ...createForm,
        brand_color: normalizeHexColor(createForm.brand_color, "#6d7f9b"),
        accent_color: normalizeHexColor(createForm.accent_color, "#5ec8ff"),
      });
      setCreateForm(EMPTY_DEPARTMENT_FORM);
      onCreateModeChange(false);
      await onChanged();
      setStatusMessage(t("dept.msg.created"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateDepartment({
        department_id: selected.id,
        display_name: editForm.display_name,
        sop: editForm.sop,
        brand_color: normalizeHexColor(editForm.brand_color, "#6d7f9b"),
        accent_color: normalizeHexColor(editForm.accent_color, "#5ec8ff"),
      });
      if (selected.name !== editForm.name.trim()) {
        await renameDepartment(selected.id, editForm.name.trim());
      }
      await onChanged();
      setStatusMessage(t("dept.msg.saved"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !transferTo) return;
    setBusy(true);
    try {
      await deleteDepartment(selected.id, transferTo);
      setSelectedId(null);
      setShowDeleteConfirm(false);
      await onChanged();
      setStatusMessage(t("dept.msg.removed"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const showEmptyList = filtered.length === 0;

  return (
    <div className="dept-split-layout">
      <section className="dept-split-main dept-split-main--list">
        <header className="dept-context-toolbar">
          <div className="dept-context-toolbar-copy">
            <h3>{t("dept.teams")}</h3>
            <p className="muted">
              {departments.length === 0
                ? t("dept.teamsEmptyHint")
                : t("dept.teamsMeta", { n: departments.length })}
            </p>
          </div>
          <div className="dept-context-toolbar-actions">
            {departments.length > 0 && onGenerateOrg ? (
              <button
                type="button"
                className="dept-ai-btn"
                disabled={busy || generating}
                onClick={onGenerateOrg}
                title={t("dept.designMissingTeams")}
              >
                {generating ? t("dept.generateStructureBusy") : t("dept.generateStructure")}
              </button>
            ) : null}
            <button
              type="button"
              className="primary-action"
              disabled={busy || generating}
              onClick={() => {
                setSelectedId(null);
                onCreateModeChange(true);
              }}
            >
              + {t("dept.addTeam")}
            </button>
          </div>
        </header>

        {departments.length > 0 ? (
          <div className="dept-list-tools">
            <SearchField
              className="dept-search"
              value={query}
              onChange={setQuery}
              placeholder={t("dept.searchTeams")}
              ariaLabel={t("dept.searchTeams")}
              matchCount={
                query.trim() || searchType !== SEARCH_TYPE_ALL ? filtered.length : undefined
              }
              totalCount={departments.length}
              size="compact"
              typeFilter={{
                value: searchType,
                onChange: setSearchType,
                options: DEPARTMENT_SEARCH_TYPES,
                ariaLabel: t("dept.searchTeams"),
                label: t("searchType.typeLabel"),
              }}
            />
          </div>
        ) : null}

        {showEmptyList ? (
          <div className="dept-empty-state dept-empty-state--hero">
            {departments.length === 0 ? (
              <>
                <p className="dept-empty-title">{t("dept.emptyTeamsTitle")}</p>
                <p className="muted">{t("dept.emptyTeamsBody")}</p>
                <div className="dept-empty-actions">
                  {onGenerateOrg ? (
                    <button
                      type="button"
                      className="primary-action"
                      disabled={busy || generating}
                      onClick={onGenerateOrg}
                    >
                      {generating ? t("dept.generateStructureBusy") : t("dept.emptyTeamsPrimary")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busy || generating}
                    onClick={() => onCreateModeChange(true)}
                  >
                    {t("dept.emptyTeamsSecondary")}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">{t("dept.noTeamsMatch")}</p>
            )}
          </div>
        ) : (
          <ul className="dept-team-list">
            {filtered.map((department) => {
              const isActive = !createMode && selectedId === department.id;
              const showInternal =
                department.name.trim().toLowerCase() !==
                department.display_name.trim().toLowerCase();
              return (
                <li key={department.id}>
                  <button
                    type="button"
                    className={`dept-team-row${isActive ? " is-active" : ""}`}
                    style={departmentAccentStyle(department)}
                    onClick={() => openDepartment(department)}
                  >
                    <span className="dept-team-stripe" aria-hidden="true" />
                    <span className="dept-team-copy">
                      <strong>{department.display_name}</strong>
                      {showInternal ? (
                        <span className="muted">{department.name}</span>
                      ) : null}
                    </span>
                    <span className="dept-team-meta">
                      <span>
                        {department.member_count} member
                        {department.member_count === 1 ? "" : "s"}
                      </span>
                      {department.head_agent_name ? (
                        <span className="dept-team-head">{department.head_agent_name}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="dept-split-side">
        {createMode ? (
          <DepartmentEditor
            mode="create"
            value={createForm}
            busy={busy || generating}
            onChange={setCreateForm}
            onSave={() => void handleCreate()}
            onCancel={() => onCreateModeChange(false)}
          />
        ) : selected ? (
          <DepartmentEditor
            mode="edit"
            value={editForm}
            busy={busy || generating}
            canDelete={departments.length > 1}
            transferOptions={transferOptions}
            transferTo={transferTo || transferOptions[0]?.name || ""}
            showDeleteConfirm={showDeleteConfirm}
            onChange={setEditForm}
            onSave={() => void handleSaveEdit()}
            onCancel={() => {
              setSelectedId(null);
              setShowDeleteConfirm(false);
            }}
            onDeleteRequest={() => {
              setShowDeleteConfirm(true);
              setTransferTo(transferOptions[0]?.name ?? "");
            }}
            onTransferChange={setTransferTo}
            onConfirmDelete={() => void handleDelete()}
          />
        ) : (
          <div className="dept-side-placeholder">
            <p className="dept-side-placeholder-title">{t("dept.pickTeamTitle")}</p>
            <p className="muted">{t("dept.pickTeamBody")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
