import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceDatabaseView } from "../../types/workspace";
import { useI18n } from "../../i18n/I18nProvider";

/** Map backend view ids → catalog keys (BE still sends English fallbacks). */
const VIEW_I18N: Record<
  string,
  { title: string; description: string; columns: string[] }
> = {
  projects: {
    title: "workspace.db.projects.title",
    description: "workspace.db.projects.desc",
    columns: [
      "workspace.db.col.project",
      "workspace.db.col.department",
      "workspace.db.col.progress",
      "workspace.db.col.priority",
    ],
  },
  deliverables: {
    title: "workspace.db.deliverables.title",
    description: "workspace.db.deliverables.desc",
    columns: [
      "workspace.db.col.gig",
      "workspace.db.col.status",
      "workspace.db.col.qcScore",
      "workspace.db.col.budget",
    ],
  },
};

export function WorkspaceDatabase() {
  const { t } = useI18n();
  const dataRevision = useWorkspaceStore((state) => state.dataRevision);
  const [views, setViews] = useState<WorkspaceDatabaseView[]>([]);

  useEffect(() => {
    void invoke<WorkspaceDatabaseView[]>("get_workspace_database")
      .then(setViews)
      .catch(() => setViews([]));
  }, [dataRevision]);

  if (views.length === 0) {
    return null;
  }

  return (
    <section className="workspace-database">
      <h3>{t("workspace.databases")}</h3>
      {views.map((view) => {
        const keys = VIEW_I18N[view.id];
        const title = keys ? t(keys.title) : view.title;
        const description = keys ? t(keys.description) : view.description;
        return (
          <article key={view.id} className="workspace-database-card">
            <header>
              <strong>{title}</strong>
              <p className="muted">{description}</p>
            </header>
            {view.rows.length === 0 ? (
              <p className="muted">{t("workspace.noRowsYet")}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {view.columns.map((column, index) => (
                      <th key={column}>
                        {keys?.columns[index] ? t(keys.columns[index]) : column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row, index) => (
                    <tr key={`${view.id}-${index}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${view.id}-${index}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        );
      })}
    </section>
  );
}
