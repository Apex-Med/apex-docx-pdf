"use client"

import type {
  BrowserCompileResult,
  BrowserRenderResult,
} from "@apex-docx-pdf/browser"
import { convexQuery, useConvexMutation } from "@convex-dev/react-query"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useSessionId, useSessionIdArg } from "convex-helpers/react/sessions"
import { useConvex } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { uploadToConvexStorage } from "@/lib/convex-upload"
import { canonicalJson, computeRenderCacheIdentity } from "@/lib/render-cache"

export type ConvexPersistenceProps = Readonly<{
  compiled?: BrowserCompileResult
  rendered?: BrowserRenderResult
  templateBytes?: Uint8Array<ArrayBuffer>
  fileName?: string
  data: Readonly<Record<string, unknown>>
  renderOptions: unknown
  resetKey: string
  onStatus?: (message: string) => void
}>

type DiagnosticsSummary = Readonly<{
  errorCount: number
  warningCount: number
  infoCount: number
  codes: string[]
}>

type RecentRender = Readonly<{
  _id: Id<"renders">
  templateId: Id<"templates">
  status:
    "queued" | "rendering" | "complete" | "failed" | "cancelled" | "deleting"
  pageCount?: number
  createdAt: number
}>

type ExistingTemplate = Readonly<{
  _id: Id<"templates">
  engineVersion: string
  status: "ready" | "invalid" | "deleting"
}>

type DeleteTarget = Readonly<{
  kind: "render" | "template"
  id: string
}>

const recentRenderLimit = 5
const textEncoder = new TextEncoder()
const metadataByteLimits = {
  manifest: 240 * 1024,
  jsonSchema: 240 * 1024,
  starterData: 240 * 1024,
} as const

export function ConvexPersistence({
  compiled,
  rendered,
  templateBytes,
  fileName,
  data,
  renderOptions,
  resetKey,
  onStatus,
}: ConvexPersistenceProps) {
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget>()
  const [status, setStatus] = useState(
    "Persistence is off. This document stays local to this browser."
  )
  const resetKeyRef = useRef(resetKey)
  const [sessionId, , sessionIdPromise] = useSessionId()
  const sessionArgs = useSessionIdArg(
    enabled ? { limit: recentRenderLimit } : "skip"
  )
  const recentQuery = useQuery(convexQuery(api.renders.recent, sessionArgs))
  const convex = useConvex()
  const generateUploadUrl = useConvexMutation(api.storage.generateUploadUrl)
  const createTemplate = useConvexMutation(api.templates.create)
  const removeTemplate = useConvexMutation(api.templates.remove)
  const beginRender = useConvexMutation(api.renders.begin)
  const completeRender = useConvexMutation(api.renders.complete)
  const failRender = useConvexMutation(api.renders.fail)
  const removeRender = useConvexMutation(api.renders.remove)
  const recentRenders = (recentQuery.data ?? []) as readonly RecentRender[]

  const report = useCallback(
    (message: string, operationResetKey = resetKeyRef.current) => {
      if (operationResetKey !== resetKeyRef.current) return
      setStatus(message)
      onStatus?.(message)
    },
    [onStatus]
  )

  useEffect(() => {
    resetKeyRef.current = resetKey
    setEnabled(false)
    setSaving(false)
    setDeleting(undefined)
    setStatus("Persistence is off. This document stays local to this browser.")
  }, [resetKey])

  const handleSave = async () => {
    if (saving || !enabled) return
    if (!compiled || !templateBytes) {
      report("Compile a DOCX before saving it.")
      return
    }

    const operationResetKey = resetKeyRef.current
    setSaving(true)
    report("Saving the current template…", operationResetKey)
    let renderId: Id<"renders"> | undefined
    let templateSaved = false

    try {
      const resolvedSessionId = sessionId ?? (await sessionIdPromise)
      const existingTemplate = (await convex.query(
        api.templates.findBySourceHash,
        {
          sessionId: resolvedSessionId,
          sourceHash: compiled.templateHash,
        }
      )) as ExistingTemplate | null
      let templateId: Id<"templates">
      if (
        existingTemplate?.status === "ready" &&
        existingTemplate.engineVersion === compiled.engineVersion
      ) {
        templateId = existingTemplate._id
      } else {
        const metadata = serializeTemplateMetadata(compiled)
        const templateDiagnostics = summarizeDiagnostics(compiled.diagnostics)
        const docxUploadUrl = await generateUploadUrl({
          sessionId: resolvedSessionId,
          kind: "docx",
        })
        const { storageId: originalFileStorageId } =
          await uploadToConvexStorage(
            docxUploadUrl,
            templateBytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          )
        templateId = (await createTemplate({
          sessionId: resolvedSessionId,
          name: normalizedTemplateName(fileName),
          originalFileStorageId: originalFileStorageId as Id<"_storage">,
          sourceHash: compiled.templateHash,
          engineVersion: compiled.engineVersion,
          manifestJson: metadata.manifestJson,
          jsonSchemaJson: metadata.jsonSchemaJson,
          starterDataJson: metadata.starterDataJson,
          status: "ready",
          diagnosticsSummary: templateDiagnostics,
        })) as Id<"templates">
      }
      templateSaved = true

      if (!rendered) {
        report(
          "Template saved. Render a PDF to persist an output too.",
          operationResetKey
        )
        return
      }

      const identity = await computeRenderCacheIdentity({
        engineVersion: compiled.engineVersion,
        templateHash: compiled.templateHash,
        fontRegistryHash: compiled.fontRegistryHash,
        data,
        renderOptions,
      })
      const cached = (await convex.query(api.renders.findCached, {
        sessionId: resolvedSessionId,
        cacheKey: identity.cacheKey,
      })) as RecentRender | null

      if (cached?.status === "complete") {
        report(
          "Template saved. Reused your completed cached render.",
          operationResetKey
        )
        return
      }

      const renderDiagnostics = summarizeDiagnostics(rendered.diagnostics)
      renderId = (await beginRender({
        sessionId: resolvedSessionId,
        templateId,
        templateHash: compiled.templateHash,
        fontRegistryHash: compiled.fontRegistryHash,
        dataHash: identity.dataHash,
        optionsHash: identity.renderOptionsHash,
        cacheKey: identity.cacheKey,
        diagnosticsSummary: renderDiagnostics,
      })) as Id<"renders">

      try {
        const pdfUploadUrl = await generateUploadUrl({
          sessionId: resolvedSessionId,
          kind: "pdf",
        })
        const { storageId: pdfStorageId } = await uploadToConvexStorage(
          pdfUploadUrl,
          rendered.pdf,
          "application/pdf"
        )
        await completeRender({
          sessionId: resolvedSessionId,
          renderId,
          pdfStorageId: pdfStorageId as Id<"_storage">,
          pageCount: rendered.pageCount,
          diagnosticsSummary: renderDiagnostics,
        })
      } catch (error) {
        await failRender({
          sessionId: resolvedSessionId,
          renderId,
          diagnosticsSummary: failedPersistenceSummary,
        }).catch(() => undefined)
        throw error
      }

      report("Template and PDF saved.", operationResetKey)
    } catch {
      report(
        templateSaved
          ? "The template was saved, but the PDF could not be persisted."
          : "Save failed. Your local document is unchanged.",
        operationResetKey
      )
    } finally {
      if (operationResetKey === resetKeyRef.current) setSaving(false)
    }
  }

  const handleDeleteRender = async (renderId: Id<"renders">) => {
    if (deleting) return
    const operationResetKey = resetKeyRef.current
    setDeleting({ kind: "render", id: renderId })
    report("Deleting the saved render…", operationResetKey)
    try {
      const resolvedSessionId = sessionId ?? (await sessionIdPromise)
      await removeRender({ sessionId: resolvedSessionId, renderId })
      report("Saved render queued for deletion.", operationResetKey)
    } catch {
      report("The saved render could not be deleted.", operationResetKey)
    } finally {
      if (operationResetKey === resetKeyRef.current) setDeleting(undefined)
    }
  }

  const handleDeleteTemplate = async (templateId: Id<"templates">) => {
    if (deleting) return
    const operationResetKey = resetKeyRef.current
    setDeleting({ kind: "template", id: templateId })
    report("Deleting the template and its saved renders…", operationResetKey)
    try {
      const resolvedSessionId = sessionId ?? (await sessionIdPromise)
      await removeTemplate({ sessionId: resolvedSessionId, templateId })
      report(
        "Template and saved renders queued for deletion.",
        operationResetKey
      )
    } catch {
      report("The template could not be deleted.", operationResetKey)
    } finally {
      if (operationResetKey === resetKeyRef.current) setDeleting(undefined)
    }
  }

  const canSave = compiled !== undefined && templateBytes !== undefined

  return (
    <Card size="sm" aria-labelledby="persistence-title">
      <CardHeader>
        <CardTitle id="persistence-title">Cloud persistence</CardTitle>
        <CardDescription>
          Off by default. Enable it only when you want to upload the current
          template and rendered PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex min-h-11 items-start gap-3 border-y border-border py-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              const nextEnabled = event.currentTarget.checked
              setEnabled(nextEnabled)
              report(
                nextEnabled
                  ? "Persistence enabled. Nothing uploads until you choose Save current."
                  : "Persistence is off. This document stays local to this browser."
              )
            }}
            className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <span>
            <span className="block font-medium">Enable persistence</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {enabled
                ? "Enabled for this document only."
                : "Local-only: no document contents are uploaded."}
            </span>
          </span>
        </label>

        <div className="border-l-2 border-amber-500/60 pl-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Privacy notice</p>
          <p>
            Anonymous session isolation is demo-only. Generated storage URLs are
            bearer URLs: anyone holding one can access it until it expires or
            the file is deleted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={!enabled || !canSave || saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Spinner className="size-3.5" />
                Saving…
              </>
            ) : (
              "Save current"
            )}
          </Button>
          {!canSave && (
            <span className="text-xs text-muted-foreground">
              Compile a DOCX to make saving available.
            </span>
          )}
        </div>

        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-muted-foreground"
        >
          {status}
        </p>

        {enabled && (
          <section aria-labelledby="recent-renders-title" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3
                id="recent-renders-title"
                className="text-xs font-semibold tracking-widest uppercase"
              >
                Recent renders
              </h3>
              {recentQuery.isFetching && <Spinner className="size-3" />}
            </div>

            {recentQuery.isError ? (
              <p className="text-xs text-destructive">
                Recent saved renders could not be loaded.
              </p>
            ) : recentRenders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved renders in this anonymous session.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {recentRenders.map((item) => {
                  const deletingRender =
                    deleting?.kind === "render" && deleting.id === item._id
                  const deletingTemplate =
                    deleting?.kind === "template" &&
                    deleting.id === item.templateId
                  return (
                    <li
                      key={item._id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 text-xs">
                        <p className="font-medium text-foreground capitalize">
                          {item.status}
                          {item.pageCount !== undefined
                            ? ` · ${item.pageCount} ${item.pageCount === 1 ? "page" : "pages"}`
                            : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {formatSavedAt(item.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          disabled={deleting !== undefined}
                          aria-label={`Delete ${item.status} saved render`}
                          onClick={() => handleDeleteRender(item._id)}
                        >
                          {deletingRender ? "Deleting…" : "Delete render"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={deleting !== undefined}
                          aria-label="Delete template and all of its saved renders"
                          onClick={() => handleDeleteTemplate(item.templateId)}
                        >
                          {deletingTemplate ? "Deleting…" : "Delete template"}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}

const failedPersistenceSummary: DiagnosticsSummary = {
  errorCount: 1,
  warningCount: 0,
  infoCount: 0,
  codes: ["PERSISTENCE_UPLOAD_FAILED"],
}

function summarizeDiagnostics(
  diagnostics: BrowserCompileResult["diagnostics"]
): DiagnosticsSummary {
  const codes = Array.from(
    new Set(
      diagnostics
        .map((diagnostic) => diagnostic.code)
        .filter((code) => /^[A-Za-z][A-Za-z0-9_./-]{0,127}$/u.test(code))
    )
  ).slice(0, 64)
  return {
    errorCount: diagnostics.filter(({ severity }) => severity === "error")
      .length,
    warningCount: diagnostics.filter(({ severity }) => severity === "warning")
      .length,
    infoCount: diagnostics.filter(({ severity }) => severity === "info").length,
    codes,
  }
}

function serializeTemplateMetadata(compiled: BrowserCompileResult) {
  const manifestJson = canonicalJson(compiled.manifest)
  const jsonSchemaJson = canonicalJson(compiled.jsonSchema)
  const starterDataJson = canonicalJson(compiled.starterData)
  assertMetadataSize(
    "Template manifest",
    manifestJson,
    metadataByteLimits.manifest
  )
  assertMetadataSize(
    "JSON schema",
    jsonSchemaJson,
    metadataByteLimits.jsonSchema
  )
  assertMetadataSize(
    "Starter data",
    starterDataJson,
    metadataByteLimits.starterData
  )
  return { manifestJson, jsonSchemaJson, starterDataJson }
}

function assertMetadataSize(label: string, json: string, maximumBytes: number) {
  if (textEncoder.encode(json).byteLength > maximumBytes) {
    throw new Error(`${label} is too large to persist safely`)
  }
}

function normalizedTemplateName(fileName: string | undefined) {
  const trimmed = fileName?.trim()
  return (trimmed || "Untitled template.docx").slice(0, 160).trim()
}

function formatSavedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}
