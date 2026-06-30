import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { WorkspaceDatabaseView } from "../../types/workspace";

export function WorkspaceDatabase() {
  const [views, setViews] = useState<WorkspaceDatabaseView[]>([]);

  useEffect(() => {
    void invoke<WorkspaceDatabaseView[]>("get_workspace_database")
      .then(setViews)
      .catch(() => setViews([]));
  }, []);

  if (views.length === 0) {
    return null;
  }

  return (
    <section className="workspace-database">
      <h3>Databases</h3>
      {views.map((view) => (
        <article key={view.id} className="workspace-database-card">
          <header>
            <strong>{view.title}</strong>
            <p className="muted">{view.description}</p>
          </header>
          {view.rows.length === 0 ? (
            <p className="muted">No rows yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  {view.columns.map((column) => (
                    <th key={column}>{column}</th>
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
      ))}
    </section>
  );
}