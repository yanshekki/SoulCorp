import { useMemo } from "react";
import { validateSoulMd } from "../../utils/soulMdValidation";

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
        aria-label="Edit soul.md"
      />
    </div>
  );
}