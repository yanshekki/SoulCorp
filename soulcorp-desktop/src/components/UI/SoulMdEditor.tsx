import { useMemo } from "react";
import { validateSoulMd } from "../../utils/soulMdValidation";
import { useI18n } from "../../i18n/I18nProvider";

interface SoulMdEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  minRows?: number;
}

export function SoulMdEditor({
  value,
  onChange,
  readOnly = false,
  minRows = 12,
}: SoulMdEditorProps) {
  const { t } = useI18n();
  const validation = useMemo(() => validateSoulMd(value), [value]);

  return (
    <div className="soul-md-editor">
      <div className="soul-md-editor-header">
        <span className="soul-md-editor-filename">soul.md</span>
        {validation.valid ? (
          <span className="soul-md-editor-status valid">
            {validation.name ? `Agent: ${validation.name}` : "Valid"}
          </span>
        ) : (
          <span className="soul-md-editor-status invalid">{validation.error}</span>
        )}
      </div>
      <textarea
        className="soul-md-editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        rows={minRows}
        spellCheck={false}
        aria-label={t("soulMd.editAria")}
      />
    </div>
  );
}