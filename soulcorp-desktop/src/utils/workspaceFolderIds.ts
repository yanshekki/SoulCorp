function departmentSlug(department: string): string {
  return department
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function agentFolderId(agentId: string): string {
  return `folder-${agentId}`;
}

/** Mirrors `workspace::storage::department_folder_id` in Rust. */
export function departmentFolderId(department: string): string {
  switch (department.trim().toLowerCase()) {
    case "engineering":
      return "folder-dept-engineering";
    case "human resources":
      return "folder-dept-hr";
    case "executive":
      return "folder-dept-executive";
    case "marketing":
      return "folder-dept-marketing";
    case "marketplace":
      return "folder-dept-marketplace";
    default:
      return `folder-dept-${departmentSlug(department)}`;
  }
}

export const COMPANY_FOLDER_ID = "folder-company";
export const PROJECTS_FOLDER_ID = "folder-projects";