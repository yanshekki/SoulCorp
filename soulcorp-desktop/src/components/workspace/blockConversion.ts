import type { JSONContent } from "@tiptap/core";
import type { WorkspaceBlock } from "../../types/workspace";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function richDocFromPage(
  richDoc?: JSONContent | null,
  blocks?: WorkspaceBlock[],
): JSONContent {
  if (richDoc?.type === "doc") {
    return richDoc;
  }
  if (!blocks || blocks.length === 0) {
    return EMPTY_DOC;
  }

  try {
    const content: JSONContent[] = blocks.map((block) => {
      const text = typeof block.content === "string" ? block.content : "";
      if (block.type === "heading") {
        return {
          type: "heading",
          attrs: { level: 2 },
          content: text ? [{ type: "text", text }] : [],
        };
      }
      if (block.type === "todo") {
        return {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: Boolean(block.checked) },
              content: [
                {
                  type: "paragraph",
                  content: text ? [{ type: "text", text }] : [],
                },
              ],
            },
          ],
        };
      }
      return {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      };
    });

    return { type: "doc", content: content.length > 0 ? content : EMPTY_DOC.content };
  } catch {
    return EMPTY_DOC;
  }
}

export function blocksFromRichDoc(doc: JSONContent): WorkspaceBlock[] {
  const nodes = doc.content ?? [];
  const blocks: WorkspaceBlock[] = [];

  for (const node of nodes) {
    const text = extractNodeText(node);
    if (!text.trim() && node.type !== "taskList") {
      continue;
    }

    if (node.type === "heading") {
      blocks.push({
        id: crypto.randomUUID(),
        type: "heading",
        content: text,
      });
      continue;
    }

    if (node.type === "taskList") {
      for (const item of node.content ?? []) {
        if (item.type !== "taskItem") {
          continue;
        }
        blocks.push({
          id: crypto.randomUUID(),
          type: "todo",
          content: extractNodeText(item),
          checked: Boolean(item.attrs?.checked),
        });
      }
      continue;
    }

    if (node.type === "blockquote") {
      blocks.push({
        id: crypto.randomUUID(),
        type: "text",
        content: `> ${text}`,
      });
      continue;
    }

    if (node.type === "codeBlock") {
      blocks.push({
        id: crypto.randomUUID(),
        type: "text",
        content: `\`\`\`\n${text}\n\`\`\``,
      });
      continue;
    }

    if (node.type === "horizontalRule") {
      blocks.push({
        id: crypto.randomUUID(),
        type: "text",
        content: "---",
      });
      continue;
    }

    blocks.push({
      id: crypto.randomUUID(),
      type: "text",
      content: text,
    });
  }

  return blocks.length > 0
    ? blocks
    : [{ id: crypto.randomUUID(), type: "text", content: "" }];
}

function extractNodeText(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }
  return (node.content ?? []).map(extractNodeText).join(" ").trim();
}