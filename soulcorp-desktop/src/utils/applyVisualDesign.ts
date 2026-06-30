import type { AgentAppearance, Agent, Building, HairStyle } from "../types/world";
import type {
  AgentVisualConfig,
  BuildingVisualConfig,
  CompanyVisualDesign,
  DesignHairStyle,
} from "../types/visualDesign";

function mapHairStyle(style: DesignHairStyle): HairStyle {
  return style;
}

export function appearanceFromVisualConfig(
  agentId: string,
  config: AgentVisualConfig,
): AgentAppearance {
  return {
    seed: agentId,
    skinColor: config.skin_color,
    shirtColor: config.shirt_color,
    pantsColor: config.pants_color,
    hairColor: config.hair_color,
    shoeColor: config.shoe_color,
    hairStyle: mapHairStyle(config.hair_style),
    height: config.height,
    build: config.build,
  };
}

export function applyBuildingVisual(
  building: Building,
  override?: BuildingVisualConfig,
): Building {
  if (!override) {
    return building;
  }
  return {
    ...building,
    color: override.color,
    roofColor: override.roof_color,
    accentColor: override.accent_color,
    size: override.size,
    name: override.signage.trim() || building.name,
    description: building.description,
  };
}

export function applyBuildingsVisualDesign(
  buildings: Building[],
  design: CompanyVisualDesign,
): Building[] {
  return buildings.map((building) =>
    applyBuildingVisual(building, design.buildings[building.id]),
  );
}

export function applyAgentVisual(agent: Agent, override?: AgentVisualConfig): Agent {
  if (!override) {
    return agent;
  }
  const appearance = appearanceFromVisualConfig(agent.id, override);
  return {
    ...agent,
    appearance,
    color: appearance.shirtColor,
  };
}

export function applyAgentsVisualDesign(
  agents: Agent[],
  design: CompanyVisualDesign,
): Agent[] {
  return agents.map((agent) => applyAgentVisual(agent, design.agents[agent.id]));
}

export function campusSkyGradient(design: CompanyVisualDesign): string {
  const { sky_top, sky_bottom } = design.campus;
  return `linear-gradient(180deg, ${sky_top} 0%, ${sky_bottom} 55%, ${design.campus.ground_primary} 56%, ${design.campus.ground_secondary} 100%)`;
}