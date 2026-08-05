import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"

export const Route = createFileRoute("/docs/supported-features")({ component: SupportedFeatures })

const rows = [
  ["DOCX package validation", "In progress", "ZIP limits, paths, relationships, and required parts"],
  ["Plain paragraphs and text", "In progress", "Unicode, spaces, and source mapping"],
  ["Inline value placeholders", "In progress", "Nested paths, types, schema, starter data"],
  ["Searchable PDF", "In progress", "Deterministic display-list serializer"],
  ["Tables and legal numbering", "Planned", "Not yet part of the advertised slice"],
  ["Headers, footers, page X of Y", "Planned", "Requires multipass pagination"],
  ["Floating content and text boxes", "Unsupported", "Material layout changes are rejected"],
] as const

function SupportedFeatures() {
  return (
    <article>
      <p className="font-mono text-xs tracking-widest text-brand uppercase">Supported features</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Claims follow evidence.</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">This live matrix stays conservative. “In progress” is not equivalent to production support.</p>
      <div className="mt-10 overflow-x-auto border">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b bg-muted/50 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            <tr><th className="p-4 font-medium">Feature</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Scope</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([feature, status, scope]) => (
              <tr key={feature}><td className="p-4 font-medium">{feature}</td><td className="p-4"><Badge variant={status === "Unsupported" ? "destructive" : "secondary"}>{status}</Badge></td><td className="p-4 text-muted-foreground">{scope}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
