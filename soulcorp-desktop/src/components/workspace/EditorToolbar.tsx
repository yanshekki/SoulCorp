import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";

interface EditorToolbarProps {
  editor: Editor;
}

interface ToolButton {
  id: string;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ws-toolbar-group" role="group" aria-label={label}>
      <span className="ws-toolbar-group-label">{label}</span>
      <div className="ws-toolbar-group-buttons">{children}</div>
    </div>
  );
}

function ToolbarButton({ button }: { button: ToolButton }) {
  return (
    <button
      type="button"
      className={`ws-toolbar-btn${button.active ? " active" : ""}`}
      title={button.title}
      aria-label={button.title}
      disabled={button.disabled}
      onClick={button.onClick}
    >
      {button.label}
    </button>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
    return () => {
      editor.off("selectionUpdate", bump);
      editor.off("transaction", bump);
    };
  }, [editor]);

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) {
      return;
    }
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const buttons: Record<string, ToolButton[]> = {
    history: [
      {
        id: "undo",
        label: "↶",
        title: "Undo (Ctrl+Z)",
        disabled: !editor.can().undo(),
        onClick: () => editor.chain().focus().undo().run(),
      },
      {
        id: "redo",
        label: "↷",
        title: "Redo (Ctrl+Y)",
        disabled: !editor.can().redo(),
        onClick: () => editor.chain().focus().redo().run(),
      },
    ],
    format: [
      {
        id: "bold",
        label: "B",
        title: "Bold (Ctrl+B)",
        active: editor.isActive("bold"),
        onClick: () => editor.chain().focus().toggleBold().run(),
      },
      {
        id: "italic",
        label: "I",
        title: "Italic (Ctrl+I)",
        active: editor.isActive("italic"),
        onClick: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        id: "underline",
        label: "U",
        title: "Underline (Ctrl+U)",
        active: editor.isActive("underline"),
        onClick: () => editor.chain().focus().toggleUnderline().run(),
      },
      {
        id: "strike",
        label: "S̶",
        title: "Strikethrough",
        active: editor.isActive("strike"),
        onClick: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        id: "code",
        label: "</>",
        title: "Inline code",
        active: editor.isActive("code"),
        onClick: () => editor.chain().focus().toggleCode().run(),
      },
      {
        id: "highlight",
        label: "◧",
        title: "Highlight",
        active: editor.isActive("highlight"),
        onClick: () => editor.chain().focus().toggleHighlight().run(),
      },
      {
        id: "link",
        label: "🔗",
        title: "Insert link",
        active: editor.isActive("link"),
        onClick: setLink,
      },
    ],
    heading: [
      {
        id: "p",
        label: "P",
        title: "Paragraph",
        active: editor.isActive("paragraph"),
        onClick: () => editor.chain().focus().setParagraph().run(),
      },
      {
        id: "h1",
        label: "H1",
        title: "Heading 1",
        active: editor.isActive("heading", { level: 1 }),
        onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "H2",
        title: "Heading 2",
        active: editor.isActive("heading", { level: 2 }),
        onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: "H3",
        title: "Heading 3",
        active: editor.isActive("heading", { level: 3 }),
        onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    list: [
      {
        id: "bullet",
        label: "•",
        title: "Bullet list",
        active: editor.isActive("bulletList"),
        onClick: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: "1.",
        title: "Numbered list",
        active: editor.isActive("orderedList"),
        onClick: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "task",
        label: "☑",
        title: "Task list",
        active: editor.isActive("taskList"),
        onClick: () => editor.chain().focus().toggleTaskList().run(),
      },
    ],
    block: [
      {
        id: "quote",
        label: "❝",
        title: "Blockquote",
        active: editor.isActive("blockquote"),
        onClick: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "codeblock",
        label: "{ }",
        title: "Code block",
        active: editor.isActive("codeBlock"),
        onClick: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "hr",
        label: "—",
        title: "Divider",
        onClick: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "table",
        label: "⊞",
        title: "Insert table",
        onClick: insertTable,
      },
    ],
    align: [
      {
        id: "left",
        label: "⫷",
        title: "Align left",
        active: editor.isActive({ textAlign: "left" }),
        onClick: () => editor.chain().focus().setTextAlign("left").run(),
      },
      {
        id: "center",
        label: "≡",
        title: "Align center",
        active: editor.isActive({ textAlign: "center" }),
        onClick: () => editor.chain().focus().setTextAlign("center").run(),
      },
      {
        id: "right",
        label: "⫸",
        title: "Align right",
        active: editor.isActive({ textAlign: "right" }),
        onClick: () => editor.chain().focus().setTextAlign("right").run(),
      },
    ],
  };

  return (
    <div className="ws-editor-toolbar" role="toolbar" aria-label="Formatting">
      {(Object.entries(buttons) as [string, ToolButton[]][]).map(([group, groupButtons]) => (
        <ToolGroup key={group} label={group}>
          {groupButtons.map((button) => (
            <ToolbarButton key={button.id} button={button} />
          ))}
        </ToolGroup>
      ))}
      {editor.isActive("table") ? (
        <ToolGroup label="table">
          <ToolbarButton
            button={{
              id: "add-col",
              label: "+Col",
              title: "Add column",
              onClick: () => editor.chain().focus().addColumnAfter().run(),
            }}
          />
          <ToolbarButton
            button={{
              id: "add-row",
              label: "+Row",
              title: "Add row",
              onClick: () => editor.chain().focus().addRowAfter().run(),
            }}
          />
          <ToolbarButton
            button={{
              id: "del-table",
              label: "✕",
              title: "Delete table",
              onClick: () => editor.chain().focus().deleteTable().run(),
            }}
          />
        </ToolGroup>
      ) : null}
    </div>
  );
}