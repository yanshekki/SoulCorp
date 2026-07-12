import type { ExecutionWorkspaceInfo } from "../../../types/game";
import { useI18n } from "../../../i18n/I18nProvider";
import { openWorkspacePage } from "../../../utils/openWorkspacePage";

interface CliInputModalProps {
  title?: string;
  command?: string | null;
  prompt: string;
  promptPath?: string | null;
  workspace?: ExecutionWorkspaceInfo | null;
  onClose: () => void;
}

/** Strip accidental markdown bold leftovers in task titles (e.g. Engineering**). */
export function cleanDisplayTitle(raw: string): string {
  return raw
    .replace(/\*{1,2}/g, "")
    .replace(/_{1,2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function CliInputModal({
  title,
  command,
  prompt,
  promptPath,
  workspace,
  onClose,
}: CliInputModalProps) {
  const { t } = useI18n();
  const displayTitle = cleanDisplayTitle(title?.trim() || t("cli.defaultTitle"));
  const combined = [
    command?.trim() ? `## ${t("cli.command")}\n${command.trim()}` : null,
    promptPath?.trim() ? `## ${t("cli.promptFile")}\n${promptPath.trim()}` : null,
    workspace
      ? `## ${t("cli.workspace")}\n- root: ${workspace.company_workspace_root}\n- folder: ${workspace.agent_folder_id} (${workspace.agent_folder_name})\n- cwd: ${workspace.cwd}`
      : null,
    `## ${t("cli.promptBody")}\n${prompt.trim() || t("common.empty")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div
      className="execution-run-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cli-input-modal-title"
      onClick={onClose}
    >
      <div
        className="execution-run-modal cli-input-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="execution-run-modal-header">
          <div>
            <p className="execution-run-modal-eyebrow">{t("cli.eyebrow")}</p>
            <h2 id="cli-input-modal-title">{displayTitle}</h2>
            <p className="muted">{t("cli.previewHint")}</p>
            <p className="cli-access-badge" role="note">
              {t("cli.policyNote")}
            </p>
          </div>
          <button
            type="button"
            className="execution-run-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <div className="cli-input-modal-body">
          {command?.trim() ? (
            <section className="cli-input-section">
              <h3>{t("cli.command")}</h3>
              <pre className="cli-input-pre cli-input-pre--command">{command}</pre>
            </section>
          ) : null}

          {promptPath?.trim() ? (
            <section className="cli-input-section">
              <h3>{t("cli.promptFile")}</h3>
              <pre className="cli-input-pre cli-input-pre--command">{promptPath}</pre>
            </section>
          ) : null}

          {workspace ? (
            <section className="cli-input-section">
              <h3>{t("cli.workspace")}</h3>
              <div className="cli-workspace-card">
                <dl className="cli-workspace-dl">
                  <div>
                    <dt>{t("cli.companyRoot")}</dt>
                    <dd>
                      <code>{workspace.company_workspace_root || "—"}</code>
                      {workspace.company_workspace_root ? (
                        <button
                          type="button"
                          className="cli-path-copy"
                          onClick={() =>
                            void navigator.clipboard
                              ?.writeText(workspace.company_workspace_root)
                              .catch(() => undefined)
                          }
                        >
                          {t("common.copy")}
                        </button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("cli.cwd")}</dt>
                    <dd>
                      <code>{workspace.cwd || "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("cli.agentFolder")}</dt>
                    <dd>
                      <code>{workspace.agent_folder_id || "—"}</code>
                      {workspace.agent_folder_name ? (
                        <span className="muted"> · {workspace.agent_folder_name}</span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("cli.memoryMd")}</dt>
                    <dd>
                      {workspace.agent_memory_md_path ? (
                        <>
                          <code>{workspace.agent_memory_md_path}</code>
                          <button
                            type="button"
                            className="cli-path-copy"
                            onClick={() =>
                              void navigator.clipboard
                                ?.writeText(workspace.agent_memory_md_path ?? "")
                                .catch(() => undefined)
                            }
                          >
                            {t("common.copy")}
                          </button>
                          {workspace.agent_memory_page_id ? (
                            <button
                              type="button"
                              className="cli-path-copy"
                              onClick={() => {
                                void openWorkspacePage(
                                  workspace.agent_memory_page_id!,
                                  "memory.md",
                                );
                              }}
                            >
                              {t("cli.openInWorkspace")}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
                {workspace.page_paths?.length ? (
                  <div className="cli-workspace-pages">
                    <strong>{t("cli.agentPages")}</strong>
                    <ul>
                      {workspace.page_paths.map((page) => (
                        <li key={page.page_id}>
                          <span>{page.title}</span>
                          <code title={page.md_path}>{page.md_path}</code>
                          <button
                            type="button"
                            className="cli-path-copy"
                            onClick={() =>
                              void navigator.clipboard
                                ?.writeText(page.md_path)
                                .catch(() => undefined)
                            }
                          >
                            {t("common.copy")}
                          </button>
                          <button
                            type="button"
                            className="cli-path-copy"
                            onClick={() => {
                              void openWorkspacePage(page.page_id, page.title);
                            }}
                          >
                            {t("common.open")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {workspace.access_notes?.length ? (
                  <ul className="cli-workspace-notes muted">
                    {workspace.access_notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="cli-input-section">
            <h3>{t("cli.promptBody")}</h3>
            <pre className="cli-input-pre">{prompt || t("common.empty")}</pre>
          </section>
        </div>
        <footer className="execution-run-modal-footer">
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              void navigator.clipboard?.writeText(combined).catch(() => undefined);
            }}
          >
            {t("common.copyAll")}
          </button>
          {command?.trim() ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                void navigator.clipboard?.writeText(command).catch(() => undefined);
              }}
            >
              {t("cli.copyCommand")}
            </button>
          ) : null}
          <button type="button" className="primary-action" onClick={onClose}>
            {t("common.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
