import type { JSONContent } from "@tiptap/core";
import { richDocFromPage } from "../components/workspace/blockConversion";
import type { WorkspacePage } from "../types/workspace";

function extractNodeText(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }
  return (node.content ?? []).map(extractNodeText).join(" ").trim();
}

function richDocPlainText(doc: JSONContent): string {
  const lines: string[] = [];
  for (const node of doc.content ?? []) {
    const text = extractNodeText(node);
    if (!text && node.type !== "horizontalRule") {
      continue;
    }
    if (node.type === "heading") {
      const level = Number(node.attrs?.level ?? 2);
      const prefix = "#".repeat(Math.min(Math.max(level, 1), 3));
      lines.push(`${prefix} ${text}`);
      continue;
    }
    if (node.type === "horizontalRule") {
      lines.push("---");
      continue;
    }
    if (node.type === "codeBlock") {
      lines.push("```", text, "```");
      continue;
    }
    if (node.type === "blockquote") {
      lines.push(`> ${text}`);
      continue;
    }
    lines.push(text);
  }
  return lines.join("\n\n").trim();
}

export function workspacePagePlainText(page: WorkspacePage): string {
  const richDoc = richDocFromPage(
    page.rich_doc as JSONContent | undefined,
    page.blocks,
  );
  const fromRich = richDocPlainText(richDoc);
  if (fromRich) {
    return fromRich;
  }
  return page.blocks.map((block) => block.content).join("\n\n").trim();
}