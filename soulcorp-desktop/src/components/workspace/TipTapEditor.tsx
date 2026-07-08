import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { EditorToolbar } from "./EditorToolbar";
import { SlashCommandExtension } from "./slashCommandExtension";

interface TipTapEditorProps {
  value: JSONContent;
  onChange: (doc: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TipTapEditor({
  value,
  onChange,
  editable = true,
  placeholder = "Type '/' for blocks, or start writing…",
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "ws-code-block" } },
        blockquote: { HTMLAttributes: { class: "ws-blockquote" } },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "ws-editor-link", rel: "noopener noreferrer" },
      }),
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
      ...(editable ? [SlashCommandExtension] : []),
    ],
    content: value,
    editable,
    editorProps: {
      attributes: {
        class: "ws-prosemirror",
        spellcheck: "true",
      },
    },
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
    if (!editor) {
      return;
    }
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return (
      <div className="ws-editor-loading">
        <span className="ws-editor-loading-spinner" aria-hidden="true" />
        Loading editor…
      </div>
    );
  }

  return (
    <div className="ws-tiptap-shell">
      {editable ? <EditorToolbar editor={editor} /> : null}
      <div className="ws-tiptap-body">
        {editable ? <EditorBubbleMenu editor={editor} /> : null}
        <EditorContent editor={editor} className="ws-tiptap-content" />
      </div>
      {editable ? (
        <footer className="ws-editor-footer-hint">
          <span>Type / for blocks · Markdown shortcuts supported</span>
          <span>Ctrl+B bold · Ctrl+I italic · Tab in lists</span>
        </footer>
      ) : null}
    </div>
  );
}