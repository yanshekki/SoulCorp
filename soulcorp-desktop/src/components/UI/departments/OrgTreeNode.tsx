import type { CSSProperties } from "react";
import type { OrgChartNode } from "../../../types/game";
import { agentInitials } from "./departmentUtils";

interface OrgTreeNodeProps {
  node: OrgChartNode;
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
  depth?: number;
}

export function OrgTreeNode({ node, selectedAgentId, onSelect, depth = 0 }: OrgTreeNodeProps) {
  const isSelected = selectedAgentId === node.agent_id;
  const hasChildren = node.children.length > 0;

  return (
    <li
      className={`dept-org-node${isSelected ? " is-selected" : ""}`}
      style={{ ["--org-depth" as string]: depth } as CSSProperties}
    >
      <button
        type="button"
        className="dept-org-node-btn"
        onClick={() => onSelect(node.agent_id)}
        aria-pressed={isSelected}
      >
        <span className="dept-org-avatar" aria-hidden="true">
          {agentInitials(node.name)}
        </span>
        <span className="dept-org-node-copy">
          <strong>{node.name}</strong>
          <span className="muted">{node.role}</span>
        </span>
        <span className="dept-org-pill">{node.department}</span>
        {hasChildren ? (
          <span className="dept-org-team-count">{node.children.length} reports</span>
        ) : null}
      </button>
      {hasChildren ? (
        <ul className="dept-org-children">
          {node.children.map((child) => (
            <OrgTreeNode
              key={child.agent_id}
              node={child}
              selectedAgentId={selectedAgentId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}