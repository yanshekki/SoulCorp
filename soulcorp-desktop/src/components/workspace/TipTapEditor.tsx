import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { useEffect } from "react";

interface TipTapEditorProps {
  value: JSONContent;
  onChange: (doc: JSONContent) => void;
  editable?: boolean;
}

export function TipTapEditor({ value, onChange, editable = true }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Write notes, meeting outcomes, or project plans...",
      }),
    ],
    content: value,
    editable,
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current !== next) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return <div className="tiptap-editor loading">Loading editor...</div>;
  }

  return (
    <div className="tiptap-shell">
      <div className="tiptap-toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          Todo
        </button>
      </div>
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );
}