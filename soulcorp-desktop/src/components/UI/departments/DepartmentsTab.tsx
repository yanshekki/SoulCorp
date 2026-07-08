import { useMemo, useState } from "react";
import { useGameStore } from "../../../stores/gameStore";
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
  updateDepartment,
} from "../../../services/departmentsClient";
import type { DepartmentListEntry } from "../../../types/game";
import { SearchField } from "../SearchField";
import { DepartmentEditor } from "./DepartmentEditor";
import {
  departmentAccentStyle,
  EMPTY_DEPARTMENT_FORM,
  type DepartmentFormState,
} from "./departmentUtils";

interface DepartmentsTabProps {
  departments: DepartmentListEntry[];
  onChanged: () => Promise<void>;
  createMode: boolean;
  onCreateModeChange: (value: boolean) => void;
}

export function DepartmentsTab({
  departments,
  onChanged,
  createMode,
  onCreateModeChange,
}: DepartmentsTabProps) {
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [createForm, setCreateForm] = useState<DepartmentFormState>(EMPTY_DEPARTMENT_FORM);
  const [editForm, setEditForm] = useState<DepartmentFormState>(EMPTY_DEPARTMENT_FORM);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return departments;
    return departments.filter(
      (department) =>
        department.name.toLowerCase().includes(needle) ||
        department.display_name.toLowerCase().includes(needle) ||
        department.sop.toLowerCase().includes(needle),
    );
  }, [departments, query]);

  const selected = departments.find((department) => department.id === selectedId) ?? null;

  const transferOptions = useMemo(
    () => departments.filter((department) => department.id !== selectedId),
    [departments, selectedId],
  );

  const openDepartment = (department: DepartmentListEntry) => {
    onCreateModeChange(false);
    setShowDeleteConfirm(false);
    setSelectedId(department.id);
    setEditForm({
      name: department.name,
      display_name: department.display_name,
      sop: department.sop,
      brand_color: department.brand_color,
      accent_color: department.accent_color,
    });
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createDepartment(createForm);
      setCreateForm(EMPTY_DEPARTMENT_FORM);
      onCreateModeChange(false);
      await onChanged();
      setStatusMessage("Department created.");
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
        brand_color: editForm.brand_color,
        accent_color: editForm.accent_color,
      });
      if (selected.name !== editForm.name.trim()) {
        await renameDepartment(selected.id, editForm.name.trim());
      }
      await onChanged();
      setStatusMessage("Department saved.");
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
      setStatusMessage("Department removed.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dept-split-layout">
      <section className="dept-split-main dept-split-main--list">
        <header className="dept-panel-toolbar">
          <div>
            <h3>Teams</h3>
            <p className="muted">{departments.length} departments · fully editable</p>
          </div>
          <SearchField
            className="dept-search"
            value={query}
            onChange={setQuery}
            placeholder="Search teams…"
            ariaLabel="Search departments"
            matchCount={query.trim() ? filtered.length : undefined}
            totalCount={departments.length}
            size="compact"
          />
        </header>

        <ul className="dept-team-list">
          {filtered.map((department) => {
            const isActive = !createMode && selectedId === department.id;
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
                    <span className="muted">{department.name}</span>
                  </span>
                  <span className="dept-team-meta">
                    <span>{department.member_count} members</span>
                    {department.head_agent_name ? <span>{department.head_agent_name}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {filtered.length === 0 ? (
          <div className="dept-empty-state dept-empty-state--inset">
            <p>No departments match your search.</p>
          </div>
        ) : null}
      </section>

      <aside className="dept-split-side">
        {createMode ? (
          <DepartmentEditor
            mode="create"
            value={createForm}
            busy={busy}
            onChange={setCreateForm}
            onSave={() => void handleCreate()}
            onCancel={() => onCreateModeChange(false)}
          />
        ) : selected ? (
          <DepartmentEditor
            mode="edit"
            value={editForm}
            busy={busy}
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
            <p className="dept-side-placeholder-title">Pick a department</p>
            <p className="muted">
              Select a team to edit its mission, colors, and routing name — or add a new one.
            </p>
            <button type="button" className="primary-action" onClick={() => onCreateModeChange(true)}>
              Add department
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}