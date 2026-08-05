import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/docs/template-language")({ component: TemplateLanguage })

function TemplateLanguage() {
  const examples = [
    ["Value", "{{patient.fullName}}"],
    ["Typed value", "{{invoice.total:number}}"],
    ["Formatter", "{{invoice.total:number | currency:\"ZAR\"}}"],
    ["Condition", "{{#if patient.hasAllergies}} … {{/if}}"],
    ["Loop", "{{#each invoice.items}} … {{/each}}"],
    ["Image", "{{@image companyLogo}}"],
  ]

  return (
    <article>
      <p className="font-mono text-xs tracking-widest text-brand uppercase">Template language</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Small, safe, and designed for documents.</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">Tags can cross Word run boundaries, but they never execute JavaScript, methods, constructors, imports, filesystem access, or network access.</p>
      <div className="mt-10 divide-y border">
        {examples.map(([label, example]) => (
          <div key={label} className="grid gap-2 p-5 sm:grid-cols-[150px_1fr] sm:items-center">
            <span className="text-sm font-medium">{label}</span>
            <code className="overflow-x-auto font-mono text-sm text-brand">{example}</code>
          </div>
        ))}
      </div>
      <div className="mt-8 border-l-2 border-destructive bg-destructive/5 p-5 text-sm leading-6 text-muted-foreground">
        Access to <code className="font-mono">__proto__</code>, <code className="font-mono">prototype</code>, and <code className="font-mono">constructor</code> is always rejected.
      </div>
    </article>
  )
}
