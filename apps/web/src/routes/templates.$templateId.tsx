"use client"

import { convexQuery } from "@convex-dev/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import { api } from "@convex/_generated/api"
import type { Doc, Id } from "@convex/_generated/dataModel"
import { useSessionIdArg } from "convex-helpers/react/sessions"
import { useState } from "react"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { cn } from "@workspace/ui/lib/utils"

export const Route = createFileRoute("/templates/$templateId")({
  component: PersistedTemplateRoute,
  head: () => ({
    meta: [
      { title: "Persisted template — Apex DOCX PDF" },
      {
        name: "description",
        content:
          "Inspect a session-owned template saved from the Apex DOCX PDF playground.",
      },
    ],
  }),
})

function PersistedTemplateRoute() {
  const { convexEnabled } = Route.useRouteContext()
  const { templateId } = Route.useParams()

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-5 lg:px-8 lg:py-14">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b pb-8">
          <div>
            <Badge className="mb-4">Session-owned workspace</Badge>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Persisted template
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Metadata and artifacts are available only to the anonymous browser
              session that saved them. This demo isolation is not production
              authentication.
            </p>
          </div>
          <Link
            to="/playground"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to playground
          </Link>
        </div>

        {convexEnabled ? (
          <PersistedTemplate templateId={templateId} />
        ) : (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Convex is not configured</CardTitle>
              <CardDescription>
                Set VITE_CONVEX_URL for this deployment to open a saved
                template. The local renderer remains available in the playground
                without it.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}

function PersistedTemplate({ templateId }: { templateId: string }) {
  const [metadataView, setMetadataView] = useState<
    "manifest" | "schema" | "starter"
  >("manifest")
  const id = templateId as Id<"templates">
  const templateArgs = useSessionIdArg({ templateId: id })
  const renderArgs = useSessionIdArg({
    templateId: id,
    paginationOpts: { numItems: 20, cursor: null },
  })
  const templateQuery = useQuery(convexQuery(api.templates.get, templateArgs))
  const fileUrlQuery = useQuery(
    convexQuery(api.templates.getOriginalFileUrl, templateArgs)
  )
  const rendersQuery = useQuery(convexQuery(api.renders.list, renderArgs))

  if (templateQuery.isPending) {
    return (
      <div
        className="mt-8 flex min-h-48 items-center justify-center gap-3 border text-sm text-muted-foreground"
        role="status"
      >
        <Spinner className="size-4" />
        Loading this session-owned template…
      </div>
    )
  }

  if (templateQuery.isError) {
    return (
      <TemplateMessage
        title="Template lookup failed"
        description="The identifier is invalid, the Convex backend is unavailable, or this session cannot access the template."
      />
    )
  }

  const template = templateQuery.data as Doc<"templates"> | null
  if (!template || template.status === "deleting") {
    return (
      <TemplateMessage
        title="Template not found"
        description="It may belong to another anonymous browser session, have been deleted, or no longer be retained."
      />
    )
  }

  const metadata = {
    manifest: template.manifestJson,
    schema: template.jsonSchemaJson,
    starter: template.starterDataJson,
  } as const
  const renders = (rendersQuery.data?.page ?? []) as readonly Doc<"renders">[]

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{template.name}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">
                  {template._id}
                </CardDescription>
              </div>
              <Badge
                variant={template.status === "ready" ? "default" : "outline"}
              >
                {template.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-px border bg-border sm:grid-cols-2">
              <MetadataItem label="Engine" value={template.engineVersion} />
              <MetadataItem
                label="Updated"
                value={new Date(template.updatedAt).toISOString()}
              />
              <MetadataItem label="Source hash" value={template.sourceHash} />
              <MetadataItem
                label="Diagnostics"
                value={`${template.diagnosticsSummary.errorCount} errors · ${template.diagnosticsSummary.warningCount} warnings`}
              />
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {fileUrlQuery.data ? (
                <a
                  href={fileUrlQuery.data}
                  download={template.name}
                  className={buttonVariants()}
                >
                  Download source DOCX
                </a>
              ) : (
                <Button disabled variant="outline">
                  Source DOCX unavailable
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compiled metadata</CardTitle>
            <CardDescription>
              The exact manifest, generated JSON Schema, and starter data saved
              with this engine version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Compiled metadata"
            >
              {(
                [
                  ["manifest", "Manifest"],
                  ["schema", "Schema"],
                  ["starter", "Starter data"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={metadataView === value}
                  onClick={() => setMetadataView(value)}
                  className={cn(
                    "min-h-10 border px-3 text-xs font-semibold transition-colors",
                    metadataView === value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <pre
              role="tabpanel"
              className="mt-4 max-h-[32rem] overflow-auto border bg-muted/30 p-4 text-xs leading-5 break-words whitespace-pre-wrap"
            >
              {prettyJson(metadata[metadataView])}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Recent renders</CardTitle>
          <CardDescription>
            The first 20 session-owned render records for this template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rendersQuery.isPending ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner className="size-4" /> Loading renders…
            </p>
          ) : rendersQuery.isError ? (
            <p className="text-sm text-destructive">
              Render history could not be loaded.
            </p>
          ) : renders.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              No render records are available for this template.
            </p>
          ) : (
            <ol className="space-y-3">
              {renders.map((render) => (
                <li key={render._id} className="border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{render.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {render.pageCount === undefined
                        ? "No PDF"
                        : `${render.pageCount} ${render.pageCount === 1 ? "page" : "pages"}`}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-[11px] break-all text-muted-foreground">
                    {render._id}
                  </p>
                  <time
                    dateTime={new Date(render.createdAt).toISOString()}
                    className="mt-2 block text-xs text-muted-foreground"
                  >
                    {new Date(render.createdAt).toISOString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-background p-4">
      <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-2 font-mono text-xs leading-5 break-all">{value}</dd>
    </div>
  )
}

function TemplateMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
