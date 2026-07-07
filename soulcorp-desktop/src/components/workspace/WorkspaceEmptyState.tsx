interface WorkspaceEmptyStateProps {
  error?: string | null;
  onCreatePage?: () => void;
}

export function WorkspaceEmptyState({ error, onCreatePage }: WorkspaceEmptyStateProps) {
  if (error) {
    return (
      <div className="ws-empty-state ws-empty-state--error">
        <div className="ws-empty-icon" aria-hidden="true">
          ⚠
        </div>
        <h2>Could not open page</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="ws-empty-state">
      <div className="ws-empty-icon" aria-hidden="true">
        📄
      </div>
      <h2>Your company knowledge base</h2>
      <p className="ws-empty-lead">
        Write meeting notes, project briefs, and deliverables in a focused editor with rich
        formatting, links, tables, and version history.
      </p>
      <ul className="ws-empty-features">
        <li>
          <strong>Rich blocks</strong> — headings, tasks, quotes, code, tables
        </li>
        <li>
          <strong>Entity links</strong> — connect pages to projects, agents, meetings
        </li>
        <li>
          <strong>Files</strong> — upload images, PDF, Office docs, archives, audio, and video
        </li>
        <li>
          <strong>Auto-save</strong> — page changes persist locally as you type
        </li>
      </ul>
      {onCreatePage ? (
        <button type="button" className="ws-empty-cta" onClick={onCreatePage}>
          Create your first page
        </button>
      ) : (
        <p className="muted">Select a page from the sidebar, or create one with the + button.</p>
      )}
    </div>
  );
}