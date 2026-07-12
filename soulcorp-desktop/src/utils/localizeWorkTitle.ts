/**
 * Display-layer localization for work-node titles that were stored in English
 * while the company UI language is Chinese (or vice-versa for common phases).
 *
 * Does not mutate stored data — only what the backlog / lists render.
 */

const PHASE_MAP_ZH_HANT: Array<[RegExp, string]> = [
  [/^Revision:\s*/i, "修訂："],
  [/^Research\s*&\s*scope:\s*/i, "研究與範圍："],
  [/^Implementation:\s*/i, "實作："],
  [/^Review\s*&\s*handoff:\s*/i, "審核與交接："],
  [/^Follow-up:\s*/i, "跟進："],
  [/^Standup follow-ups$/i, "站會跟進事項"],
  [/^Crisis response actions$/i, "危機應對行動"],
  [/^Team follow-ups$/i, "團隊建設跟進"],
  [/^Advance\s+/i, "推進 "],
];

const PHASE_MAP_ZH_HANS: Array<[RegExp, string]> = [
  [/^Revision:\s*/i, "修订："],
  [/^Research\s*&\s*scope:\s*/i, "研究与范围："],
  [/^Implementation:\s*/i, "实现："],
  [/^Review\s*&\s*handoff:\s*/i, "审核与交接："],
  [/^Follow-up:\s*/i, "跟进："],
  [/^Standup follow-ups$/i, "站会跟进事项"],
  [/^Crisis response actions$/i, "危机应对行动"],
  [/^Team follow-ups$/i, "团队建设跟进"],
  [/^Advance\s+/i, "推进 "],
];

/** Apply known English phase prefixes → current UI language (repeat for stacked Revision:). */
export function localizeWorkTitle(title: string, language: string): string {
  const lang = (language || "en").toLowerCase().replace(/_/g, "-");
  if (!title.trim()) {
    return title;
  }
  if (lang === "en" || lang.startsWith("en-")) {
    return title;
  }
  const map =
    lang.includes("hans") || lang === "zh-cn" || lang === "zh"
      ? PHASE_MAP_ZH_HANS
      : PHASE_MAP_ZH_HANT;

  let out = title;
  // Multiple passes for "Revision: Implementation: …"
  for (let i = 0; i < 6; i++) {
    let changed = false;
    for (const [re, rep] of map) {
      if (re.test(out)) {
        out = out.replace(re, rep);
        changed = true;
        break;
      }
    }
    if (!changed) {
      break;
    }
  }
  return out;
}

/** Short description hints for known English template bodies. */
export function localizeWorkDescription(description: string, language: string): string {
  const lang = (language || "en").toLowerCase().replace(/_/g, "-");
  if (!description.trim() || lang === "en" || lang.startsWith("en-")) {
    return description;
  }
  const hant = !(lang.includes("hans") || lang === "zh-cn" || lang === "zh");
  const pairs: Array<[string, string, string]> = [
    [
      "Implement real source code under the company workspace project (not docs-only).",
      "在公司工作區專案內實作真實原始碼（不可只交文件）。",
      "在公司工作区项目内实现真实源码（不可只交文档）。",
    ],
    [
      "Survey existing code under the company workspace project and capture constraints.",
      "檢視公司工作區既有程式碼並整理限制與範圍。",
      "检视公司工作区既有代码并整理约束与范围。",
    ],
    [
      "Verify code artifacts, summarize changes, and hand off with paths.",
      "核實程式產物、摘要變更並附路徑交接。",
      "核实代码产物、摘要变更并附路径交接。",
    ],
    [
      "Gather context and constraints.",
      "蒐集背景與限制條件。",
      "收集背景与约束条件。",
    ],
    [
      "Build the core deliverable.",
      "產出核心交付物。",
      "产出核心交付物。",
    ],
    [
      "PM review and Workspace publish.",
      "PM 審核並發佈至工作區。",
      "PM 审核并发布至工作区。",
    ],
  ];
  const trimmed = description.trim();
  for (const [en, zhHant, zhHans] of pairs) {
    if (trimmed === en || trimmed.startsWith(en)) {
      return hant ? zhHant : zhHans;
    }
  }
  // Advance story description pattern
  const m = trimmed.match(
    /^Push (.+) toward delivery\. Current progress ([\d.]+)%\. Owner department: ([^.]+)(.*)$/i,
  );
  if (m) {
    const [, proj, pct, dept, rest] = m;
    if (hant) {
      return `推動「${proj}」邁向交付。目前進度 ${pct}%。負責部門：${dept}。${rest || ""}`.trim();
    }
    return `推动「${proj}」迈向交付。目前进度 ${pct}%。负责部门：${dept}。${rest || ""}`.trim();
  }
  return description;
}
