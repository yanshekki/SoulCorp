import type { Editor, Range } from "@tiptap/core";

export interface SlashCommandItem {
  id: string;
  titleKey: string;
  descriptionKey: string;
  /** English fallbacks for filter matching when UI language differs. */
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

function runBlockCommand(
  editor: Editor,
  range: Range,
  action: (chain: ReturnType<Editor["chain"]>) => void,
): void {
  const chain = editor.chain().focus().deleteRange(range);
  action(chain);
  chain.run();
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "paragraph",
    titleKey: "slash.paragraph.title",
    descriptionKey: "slash.paragraph.desc",
    title: "Text",
    description: "Plain paragraph",
    icon: "¶",
    keywords: ["text", "paragraph", "p"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.setParagraph());
    },
  },
  {
    id: "heading-1",
    titleKey: "slash.heading-1.title",
    descriptionKey: "slash.heading-1.desc",
    title: "Heading 1",
    description: "Large section title",
    icon: "H1",
    keywords: ["heading", "title", "h1"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleHeading({ level: 1 }));
    },
  },
  {
    id: "heading-2",
    titleKey: "slash.heading-2.title",
    descriptionKey: "slash.heading-2.desc",
    title: "Heading 2",
    description: "Medium section title",
    icon: "H2",
    keywords: ["heading", "subtitle", "h2"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleHeading({ level: 2 }));
    },
  },
  {
    id: "heading-3",
    titleKey: "slash.heading-3.title",
    descriptionKey: "slash.heading-3.desc",
    title: "Heading 3",
    description: "Small section title",
    icon: "H3",
    keywords: ["heading", "h3"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleHeading({ level: 3 }));
    },
  },
  {
    id: "bullet-list",
    titleKey: "slash.bullet-list.title",
    descriptionKey: "slash.bullet-list.desc",
    title: "Bullet list",
    description: "Unordered list",
    icon: "•",
    keywords: ["bullet", "list", "ul"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleBulletList());
    },
  },
  {
    id: "ordered-list",
    titleKey: "slash.ordered-list.title",
    descriptionKey: "slash.ordered-list.desc",
    title: "Numbered list",
    description: "Ordered list",
    icon: "1.",
    keywords: ["numbered", "ordered", "ol"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleOrderedList());
    },
  },
  {
    id: "task-list",
    titleKey: "slash.task-list.title",
    descriptionKey: "slash.task-list.desc",
    title: "Task list",
    description: "Checklist with boxes",
    icon: "☑",
    keywords: ["task", "todo", "checkbox", "checklist"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleTaskList());
    },
  },
  {
    id: "blockquote",
    titleKey: "slash.blockquote.title",
    descriptionKey: "slash.blockquote.desc",
    title: "Quote",
    description: "Indented quotation",
    icon: "❝",
    keywords: ["quote", "blockquote"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleBlockquote());
    },
  },
  {
    id: "code-block",
    titleKey: "slash.code-block.title",
    descriptionKey: "slash.code-block.desc",
    title: "Code block",
    description: "Monospace code snippet",
    icon: "{ }",
    keywords: ["code", "snippet", "pre"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.toggleCodeBlock());
    },
  },
  {
    id: "divider",
    titleKey: "slash.divider.title",
    descriptionKey: "slash.divider.desc",
    title: "Divider",
    description: "Horizontal rule",
    icon: "—",
    keywords: ["divider", "hr", "line", "separator"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) => chain.setHorizontalRule());
    },
  },
  {
    id: "table",
    titleKey: "slash.table.title",
    descriptionKey: "slash.table.desc",
    title: "Table",
    description: "3×3 table with header row",
    icon: "⊞",
    keywords: ["table", "grid", "spreadsheet"],
    command: ({ editor, range }) => {
      runBlockCommand(editor, range, (chain) =>
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
      );
    },
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return SLASH_COMMANDS;
  }
  return SLASH_COMMANDS.filter((item) => {
    if (item.title.toLowerCase().includes(normalized)) {
      return true;
    }
    if (item.description.toLowerCase().includes(normalized)) {
      return true;
    }
    if (item.id.toLowerCase().includes(normalized)) {
      return true;
    }
    return item.keywords.some((keyword) => keyword.includes(normalized));
  });
}
