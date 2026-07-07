import type { DepartmentListEntry } from "../../../types/game";
import type { DepartmentFormState } from "./departmentUtils";

interface DepartmentEditorProps {
  mode: "create" | "edit";
  value: DepartmentFormState;
  busy: boolean;
  canDelete?: boolean;
  transferOptions?: DepartmentListEntry[];
  transferTo?: string;
  onChange: (value: DepartmentFormState) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDeleteRequest?: () => void;
  onTransferChange?: (value: string) => void;
  onConfirmDelete?: () => void;
  showDeleteConfirm?: boolean;
}

export function DepartmentEditor({
  mode,
  value,
  busy,
  canDelete,
  transferOptions = [],
  transferTo = "",
  onChange,
  onSave,
  onCancel,
  onDeleteRequest,
  onTransferChange,
  onConfirmDelete,
  showDeleteConfirm,
}: DepartmentEditorProps) {
  return (
    <div className="dept-editor">
      <header className="dept-editor-header">
        <div>
          <p className="dept-editor-eyebrow">{mode === "create" ? "New department" : "Edit department"}</p>
          <h3>{mode === "create" ? "Create a team" : value.display_name || "Department"}</h3>
        </div>
        <div
          className="dept-editor-preview"
          style={{ background: value.brand_color, boxShadow: `inset 0 -0.35rem 0 ${value.accent_color}` }}
          aria-hidden="true"
        />
      </header>

      <div className="dept-editor-fields">
        <label className="field-label">
          Internal name
          <input
            value={value.name}
            placeholder="e.g. product"
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
          <span className="field-hint">Used in routing, projects, and token wallets.</span>
        </label>
        <label className="field-label">
          Display name
          <input
            value={value.display_name}
            placeholder="e.g. Product Studio"
            onChange={(event) => onChange({ ...value, display_name: event.target.value })}
          />
        </label>
        <label className="field-label">
          Mission / SOP
          <textarea
            rows={4}
            value={value.sop}
            placeholder="What does this department own?"
            onChange={(event) => onChange({ ...value, sop: event.target.value })}
          />
        </label>
        <div className="dept-editor-colors">
          <label className="field-label">
            Brand
            <input
              type="color"
              value={value.brand_color}
              onChange={(event) => onChange({ ...value, brand_color: event.target.value })}
            />
          </label>
          <label className="field-label">
            Accent
            <input
              type="color"
              value={value.accent_color}
              onChange={(event) => onChange({ ...value, accent_color: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="dept-editor-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={onSave}>
          {mode === "create" ? "Create department" : "Save changes"}
        </button>
        {mode === "edit" && onCancel ? (
          <button type="button" className="tiny-btn" onClick={onCancel}>
            Close
          </button>
        ) : null}
        {mode === "edit" && canDelete && onDeleteRequest && !showDeleteConfirm ? (
          <button type="button" className="tiny-btn delete-dept-btn" disabled={busy} onClick={onDeleteRequest}>
            Delete department
          </button>
        ) : null}
      </div>

      {showDeleteConfirm ? (
        <div className="dept-delete-confirm">
          <p className="muted">
            Members and project ownership will move to another department before this team is removed.
          </p>
          <label className="field-label">
            Transfer members to
            <select value={transferTo} onChange={(event) => onTransferChange?.(event.target.value)}>
              {transferOptions.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.display_name}
                </option>
              ))}
            </select>
          </label>
          <div className="dept-editor-actions">
            <button
              type="button"
              className="primary-action"
              disabled={busy || !transferTo}
              onClick={onConfirmDelete}
            >
              Confirm delete
            </button>
            <button type="button" className="tiny-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}