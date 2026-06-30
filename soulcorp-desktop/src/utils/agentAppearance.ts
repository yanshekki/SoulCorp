import type { AgentAppearance, HairStyle } from "../types/world";

const SKIN_TONES = ["#f1c7a5", "#d8a67f", "#b87952", "#8d5524", "#f5d6c6"];
const SHIRT_COLORS = ["#5ec8ff", "#ff9bd5", "#ffd166", "#9fd5a8", "#c9b6ff", "#ff8b6a"];
const PANTS_COLORS = ["#3d4f6f", "#4a3d52", "#2f4a3a", "#5c4a38", "#2d3142"];
const HAIR_COLORS = ["#2b1d12", "#5a3825", "#1f1308", "#8b5a2b", "#d4b896"];
const HAIR_STYLES: HairStyle[] = ["short", "bob", "spiky", "long"];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

export function generateAgentAppearance(agentId: string): AgentAppearance {
  const random = seededRandom(hashString(agentId));
  const shirtColor = pick(SHIRT_COLORS, random);

  return {
    seed: agentId,
    skinColor: pick(SKIN_TONES, random),
    shirtColor,
    pantsColor: pick(PANTS_COLORS, random),
    hairColor: pick(HAIR_COLORS, random),
    shoeColor: "#2a2a2a",
    hairStyle: pick(HAIR_STYLES, random),
    height: 0.92 + random() * 0.16,
    build: 0.9 + random() * 0.2,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}