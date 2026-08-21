import { ApexEditor } from "@apexmed/editor"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/editor")({
  component: EditorPlaygroundPage,
  head: () => ({
    meta: [
      {
        title: "DOCX Editor — Apex DOCX PDF",
      },
      {
        name: "description",
        content:
          "Engine-authoritative paginated DOCX editor with Print Preview and DOCX/PDF download.",
      },
    ],
  }),
})

function EditorPlaygroundPage() {
  return (
    <main className="h-svh min-h-[480px] overflow-hidden border-0 border-border bg-background text-foreground">
      <h1 className="sr-only">DOCX Editor</h1>
      <ApexEditor className="h-svh min-h-0" />
    </main>
  )
}
