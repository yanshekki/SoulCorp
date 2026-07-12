import { PRESET_AGENTS } from "../data/presetAgents";

export interface SoulTemplateOption {
  id: string;
  label: string;
  /** Short hint for UI chips */
  description: string;
  content: string;
  /** Preferred department match score (higher = better for this dept) */
  departmentMatch: number;
}

function normalizeDept(name: string): string {
  return name.trim().toLowerCase();
}

function deptMatches(presetDept: string, departmentName: string): boolean {
  const a = normalizeDept(presetDept);
  const b = normalizeDept(departmentName);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

export function blankSoulScaffold(params: {
  name?: string;
  role?: string;
  department?: string;
}): string {
  const name = params.name?.trim() || "New Hire";
  const role = params.role?.trim() || "Specialist";
  const department = params.department?.trim() || "General";
  return `# ${name}

## Personality
Focused professional suited to ${department}.

## Values
Quality work, clear communication, reliable delivery.

## Communication Style
Clear and professional as a ${role}.
`;
}

/**
 * Soul.md starting points for a department: matching presets first, then all
 * presets, then a blank department scaffold.
 */
export function soulTemplatesForDepartment(
  departmentName: string,
  opts?: { role?: string; name?: string },
): SoulTemplateOption[] {
  const department = departmentName.trim() || "General";
  const role = opts?.role?.trim() || "Specialist";
  const name = opts?.name?.trim();

  const fromPresets: SoulTemplateOption[] = PRESET_AGENTS.map((preset) => {
    const match = deptMatches(preset.department, department) ? 2 : 0;
    return {
      id: `preset-${preset.preset_id}`,
      label: preset.name,
      description: `${preset.role} · ${preset.department}`,
      content: name
        ? preset.defaultSoulMd.replace(/^#\s+.+$/m, `# ${name}`)
        : preset.defaultSoulMd,
      departmentMatch: match,
    };
  }).sort((left, right) => right.departmentMatch - left.departmentMatch);

  const blank: SoulTemplateOption = {
    id: "blank-dept",
    label: "Blank for department",
    description: `Empty scaffold · ${department}`,
    content: blankSoulScaffold({ name, role, department }),
    departmentMatch: 1,
  };

  return [...fromPresets, blank];
}

/** Best single template for a department (for suggest-on-dept-change). */
export function preferredSoulTemplateForDepartment(
  departmentName: string,
  opts?: { role?: string; name?: string },
): SoulTemplateOption {
  const options = soulTemplatesForDepartment(departmentName, opts);
  const preferred = options.find((option) => option.departmentMatch >= 2);
  return preferred ?? options[options.length - 1]!;
}
