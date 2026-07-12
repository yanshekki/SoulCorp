import type { DepartmentListEntry } from "../../../types/game";
import { normalizeHexColor, type DepartmentFormState } from "./departmentUtils";
import { useI18n } from "../../../i18n/I18nProvider";

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

export function DepartmentEditor({mode,
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
  const { t } = useI18n();
  const brand = normalizeHexColor(value.brand_color, "#6d7f9b");
  const accent = normalizeHexColor(value.accent_color, "#5ec8ff");

  return (
    <div className="dept-editor">
      <header className="dept-editor-header">
        <div>
          <p className="dept-editor-eyebrow">
            {mode === "create" ? t("dept.newTeam") : t("dept.editTeam")}
          </p>
          <h3>{mode === "create" ? t("dept.createATeam") : value.display_name || t("dept.team")}</h3>
        </div>
        <div
          className="dept-editor-preview"
          style={{ background: brand, boxShadow: `inset 0 -0.35rem 0 ${accent}` }}
          aria-hidden="true"
        />
      </header>

      <div className="dept-editor-fields">
        <label className="field-label">
          Internal name
          <input
            value={value.name}
            placeholder={t("dept.idPlaceholder")}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
          <span className="field-hint">{t("dept.idHint")}</span>
        </label>
        <label className="field-label">
          Display name
          <input
            value={value.display_name}
            placeholder={t("dept.displayNamePh")}
            onChange={(event) => onChange({ ...value, display_name: event.target.value })}
          />
        </label>
        <label className="field-label">
          {t("dept.missionSop")}
          <textarea
            rows={4}
            value={value.sop}
            placeholder={t("dept.sopPlaceholder")}
            onChange={(event) => onChange({ ...value, sop: event.target.value })}
          />
        </label>
        <div className="dept-editor-colors">
          <label className="field-label">
            {t("dept.brand")}
            <div className="dept-color-field">
              <input
                type="color"
                className="dept-color-swatch"
                value={brand}
                onChange={(event) =>
                  onChange({
                    ...value,
                    brand_color: normalizeHexColor(event.target.value, brand),
                  })
                }
                aria-label={t("dept.brandColor")}
              />
              <input
                type="text"
                className="dept-color-hex"
                value={brand}
                spellCheck={false}
                maxLength={7}
                onChange={(event) =>
                  onChange({
                    ...value,
                    brand_color: normalizeHexColor(event.target.value, brand),
                  })
                }
              />
            </div>
          </label>
          <label className="field-label">
            {t("dept.accent")}
            <div className="dept-color-field">
              <input
                type="color"
                className="dept-color-swatch"
                value={accent}
                onChange={(event) =>
                  onChange({
                    ...value,
                    accent_color: normalizeHexColor(event.target.value, accent),
                  })
                }
                aria-label={t("dept.accentColor")}
              />
              <input
                type="text"
                className="dept-color-hex"
                value={accent}
                spellCheck={false}
                maxLength={7}
                onChange={(event) =>
                  onChange({
                    ...value,
                    accent_color: normalizeHexColor(event.target.value, accent),
                  })
                }
              />
            </div>
          </label>
        </div>
      </div>

      {!showDeleteConfirm ? (
        <div className="dept-editor-actions">
          <div className="dept-editor-actions-primary">
            <button type="button" className="primary-action" disabled={busy} onClick={onSave}>
              {mode === "create" ? t("dept.createTeam") : t("dept.saveChanges")}
            </button>
            {mode === "edit" && onCancel ? (
              <button type="button" className="secondary-action" disabled={busy} onClick={onCancel}>{t("common.close")}</button>
            ) : null}
            {mode === "create" && onCancel ? (
              <button type="button" className="secondary-action" disabled={busy} onClick={onCancel}>
                {t("common.cancel")}
              </button>
            ) : null}
          </div>
          {mode === "edit" && canDelete && onDeleteRequest ? (
            <div className="dept-editor-actions-danger">
              <button
                type="button"
                className="dept-delete-btn"
                disabled={busy}
                onClick={onDeleteRequest}
              >
                {t("dept.deleteTeam")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div className="dept-delete-confirm">
          <p className="muted">
            Members and project ownership will move to another department before this team is
            removed.
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
          <div className="dept-editor-actions-primary">
            <button
              type="button"
              className="primary-action"
              disabled={busy || !transferTo}
              onClick={onConfirmDelete}
            >
              {t("dept.confirmDelete")}
            </button>
            <button type="button" className="secondary-action" onClick={onCancel}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
