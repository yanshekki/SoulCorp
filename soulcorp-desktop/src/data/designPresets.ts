import type { DesignPreset } from "../types/visualDesign";

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "default",
    title: "Classic Campus",
    description: "Balanced daytime sky with green lawns and neutral buildings.",
    category: "full",
    preview: "🌤️",
  },
  {
    id: "warm-startup",
    title: "Warm Startup",
    description: "Friendly terracotta HQ with colorful engineering and HR wings.",
    category: "full",
    preview: "🌅",
  },
  {
    id: "glass-towers",
    title: "Glass Towers",
    description: "Cool glass facades for HQ, engineering, and HR buildings.",
    category: "full",
    preview: "🏙️",
  },
  {
    id: "sunset-campus",
    title: "Sunset Campus",
    description: "Golden-hour sky with warm ambient lighting.",
    category: "campus",
    preview: "🌇",
  },
  {
    id: "night-campus",
    title: "Night Campus",
    description: "Deep blue night sky with low ambient glow.",
    category: "campus",
    preview: "🌙",
  },
];

export const BUILDING_STYLE_OPTIONS = [
  { id: "modern", label: "Modern", description: "Clean lines and bright accents." },
  { id: "classic", label: "Classic", description: "Brick tones and traditional roofs." },
  { id: "glass", label: "Glass", description: "Reflective facade with cool palette." },
  { id: "industrial", label: "Industrial", description: "Steel tones and bold signage." },
  { id: "startup", label: "Startup", description: "Playful colors and compact volumes." },
] as const;

export const OFFICE_DESK_OPTIONS = [
  { id: "open", label: "Open Floor", description: "Shared desks and collaborative flow." },
  { id: "cubicle", label: "Cubicle", description: "Partitioned workstations." },
  { id: "executive", label: "Executive", description: "Private offices and premium finishes." },
  { id: "creative", label: "Creative", description: "Bold walls, boards, and maker tables." },
  { id: "lounge", label: "Lounge", description: "Soft seating with relaxed lighting." },
] as const;

export const AGENT_PRESET_LOOKS = [
  {
    id: "professional",
    label: "Professional",
    config: {
      shirt_color: "#4a6fa5",
      pants_color: "#2d3142",
      hair_style: "short" as const,
    },
  },
  {
    id: "creative",
    label: "Creative",
    config: {
      shirt_color: "#ff8b6a",
      pants_color: "#4a3d52",
      hair_style: "bob" as const,
    },
  },
  {
    id: "executive",
    label: "Executive",
    config: {
      shirt_color: "#2d3142",
      pants_color: "#1f2937",
      hair_style: "short" as const,
      accessory: "briefcase",
    },
  },
  {
    id: "casual",
    label: "Casual",
    config: {
      shirt_color: "#9fd5a8",
      pants_color: "#5c4a38",
      hair_style: "spiky" as const,
    },
  },
];