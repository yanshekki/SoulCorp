import { useI18n } from "../../i18n/I18nProvider";
import type { RelationshipGraph, RelationshipGraphNode } from "../../types/game";

interface RelationshipGraphViewProps {
  graph: RelationshipGraph;
}

function nodePosition(index: number, total: number, radius: number, center: number) {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function edgeColor(score: number): string {
  if (score >= 0.65) {
    return "rgba(120, 200, 150, 0.75)";
  }
  if (score >= 0.35) {
    return "rgba(180, 190, 220, 0.65)";
  }
  return "rgba(255, 140, 140, 0.75)";
}

function nodeById(nodes: RelationshipGraphNode[], agentId: string) {
  return nodes.find((node) => node.agent_id === agentId);
}

export function RelationshipGraphView({ graph }: RelationshipGraphViewProps) {
  const { t } = useI18n();
  const size = 280;
  const center = size / 2;
  const radius = 96;
  const positions = new Map(
    graph.nodes.map((node, index) => [
      node.agent_id,
      nodePosition(index, graph.nodes.length, radius, center),
    ]),
  );

  if (graph.nodes.length === 0) {
    return <p className="muted">{t("graph.empty")}</p>;
  }

  return (
    <div className="relationship-graph">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t("graph.aria")}>
        {graph.edges.map((edge) => {
          const from = positions.get(edge.from_agent_id);
          const to = positions.get(edge.to_agent_id);
          if (!from || !to) {
            return null;
          }
          return (
            <g key={`${edge.from_agent_id}-${edge.to_agent_id}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={edgeColor(edge.score)}
                strokeWidth={2 + Math.abs(edge.score) * 2}
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2}
                className="relationship-edge-label"
              >
                {edge.label}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((node) => {
          const point = positions.get(node.agent_id);
          if (!point) {
            return null;
          }
          return (
            <g key={node.agent_id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={18}
                className={`relationship-node morale-${node.morale >= 0.7 ? "high" : node.morale >= 0.5 ? "mid" : "low"}`}
              />
              <text x={point.x} y={point.y + 4} className="relationship-node-label">
                {node.name.split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="relationship-legend">
        {graph.edges.map((edge) => {
          const from = nodeById(graph.nodes, edge.from_agent_id);
          const to = nodeById(graph.nodes, edge.to_agent_id);
          if (!from || !to) {
            return null;
          }
          return (
            <li key={`${edge.from_agent_id}-${edge.to_agent_id}-legend`}>
              <strong>{from.name}</strong> ↔ <strong>{to.name}</strong>
              <span>
                {edge.label} · {(edge.score * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}