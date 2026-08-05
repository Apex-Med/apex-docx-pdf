import { json } from "@codemirror/lang-json"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { linter, lintGutter } from "@codemirror/lint"
import type { Diagnostic } from "@codemirror/lint"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import CodeMirror from "@uiw/react-codemirror"
import { cn } from "@workspace/ui/lib/utils"
import { useMemo } from "react"

import { parseTemplateJson } from "@/lib/json-editor"

type JsonEditorProps = Readonly<{
  id?: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  "aria-describedby"?: string
  className?: string
  minHeight?: number
}>

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "12px",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
    padding: "12px 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "color-mix(in oklab, var(--brand) 28%, transparent)",
    },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--muted) 70%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--muted) 70%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.5rem",
    paddingRight: "10px",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 4px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0",
    color: "var(--popover-foreground)",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
  },
  ".cm-tooltip.cm-tooltip-lint": {
    maxWidth: "28rem",
  },
  ".cm-diagnostic": {
    padding: "4px 8px",
  },
  ".cm-diagnostic-error": {
    borderLeftColor: "var(--destructive)",
  },
  ".cm-lintRange-error": {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L3 0 L6 3' fill='none' stroke='%23c2410c' stroke-width='1'/%3E%3C/svg%3E\")",
  },
  ".cm-lint-marker-error": {
    content: '""',
  },
  ".cm-panel.cm-panel-lint ul": {
    fontFamily: "var(--font-mono)",
    maxHeight: "8rem",
  },
  "&.cm-editor.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
    overflow: "auto",
  },
})

const jsonHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--cm-json-key)" },
  { tag: t.string, color: "var(--cm-json-string)" },
  { tag: t.number, color: "var(--cm-json-number)" },
  { tag: t.bool, color: "var(--cm-json-keyword)" },
  { tag: t.null, color: "var(--cm-json-keyword)" },
  { tag: t.punctuation, color: "var(--cm-json-punctuation)" },
  { tag: t.bracket, color: "var(--cm-json-bracket)" },
  { tag: t.invalid, color: "var(--destructive)" },
])

function templateJsonLinter() {
  return (view: EditorView): Diagnostic[] => {
    const text = view.state.doc.toString()
    if (!text.trim()) {
      return [
        {
          from: 0,
          to: view.state.doc.length,
          severity: "error",
          message:
            'JSON object is empty. Enter an object like { "field": "value" }.',
        },
      ]
    }

    const result = parseTemplateJson(text)
    if (result.ok) return []

    const from = Math.min(result.issue.position ?? 0, view.state.doc.length)
    const to = Math.min(view.state.doc.length, Math.max(from + 1, from))
    return [
      {
        from,
        to,
        severity: "error",
        message: result.issue.message,
      },
    ]
  }
}

export function JsonEditor({
  id,
  value,
  onChange,
  invalid = false,
  "aria-describedby": ariaDescribedBy,
  className,
  minHeight = 430,
}: JsonEditorProps) {
  const extensions = useMemo((): Extension[] => {
    return [
      json(),
      lintGutter(),
      linter(templateJsonLinter(), { delay: 200 }),
      syntaxHighlighting(jsonHighlightStyle),
      editorTheme,
      EditorView.lineWrapping,
    ]
  }, [])

  return (
    <div
      className={cn(
        "json-editor overflow-hidden border bg-muted/20 transition-[border-color]",
        "focus-within:border-ring",
        invalid && "border-destructive dark:border-destructive/50",
        className
      )}
      style={{ minHeight }}
    >
      <CodeMirror
        id={id}
        value={value}
        height={`${minHeight}px`}
        theme="none"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          searchKeymap: true,
        }}
        extensions={extensions}
        onChange={onChange}
        aria-invalid={invalid}
        aria-describedby={ariaDescribedBy}
        className="text-xs"
      />
    </div>
  )
}
