import { useWorkspaceStore } from "../../stores/workspaceStore";
import { FileViewer } from "./FileViewer";
import { PageEditor } from "./PageEditor";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

export function WorkspaceMainPanel() {
  const selectedFile = useWorkspaceStore((state) => state.selectedFile);
  const selectedPage = useWorkspaceStore((state) => state.selectedPage);
  const openingFileId = useWorkspaceStore((state) => state.openingFileId);
  const openingPageId = useWorkspaceStore((state) => state.openingPageId);
  const pageOpenError = useWorkspaceStore((state) => state.pageOpenError);
  const fileOpenError = useWorkspaceStore((state) => state.fileOpenError);

  if (selectedFile || openingFileId) {
    return <FileViewer />;
  }

  if (selectedPage || openingPageId) {
    return <PageEditor />;
  }

  return (
    <div className="ws-editor-root ws-editor-root--empty">
      <WorkspaceEmptyState error={pageOpenError ?? fileOpenError} />
    </div>
  );
}