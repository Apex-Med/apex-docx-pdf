import {
  Add01Icon,
  Cancel02Icon,
  CheckmarkCircle02Icon,
  CopyIcon,
  Delete02Icon,
  File02Icon,
  PlayIcon,
  Refresh01Icon,
  Upload02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BrowserRenderError,
  BrowserRendererClient,
  ObjectUrlLease,
} from "@apex-docx-pdf/browser"
import type {
  BrowserCompileResult,
  BrowserRenderResult,
  WorkerProgress,
} from "@apex-docx-pdf/browser"
import type { RenderOptions, TemplateField } from "@apex-docx-pdf/core"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"

import { DocxViewerPreview } from "@/components/extend/docx-viewer"
import { PDFViewer } from "@/components/extend/pdf-viewer"
import { JsonEditor } from "@/components/json-editor"
import { SiteHeader } from "@/components/site-header"
import { formatJsonIssue, parseTemplateJson } from "@/lib/json-editor"
import {
  addArrayItem,
  concretePath,
  getPath,
  removeArrayItem,
  setPath,
} from "@/lib/form-data"
import { SAMPLE_DATA, createSampleDocx } from "@/lib/sample-docx"
import {
  BROWSER_PROFILE_LABEL,
  BUNDLED_FONT_PROFILE,
  PROFILE_CAPABILITIES,
  describeWorkerProgress,
  inspectTemplate,
} from "@/lib/template-inspection"

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const PLAYGROUND_RENDER_OPTIONS = Object.freeze({
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  metadata: Object.freeze({
    title: "Apex DOCX PDF playground document",
  }),
  includeLayoutTrace: true,
}) satisfies Omit<RenderOptions, "signal">

type Activity = Readonly<{
  state: "idle" | "working" | "complete" | "error"
  label: string
  progress?: WorkerProgress
}>

type WorkspacePanel = "template" | "data" | "result"

const workspacePanels = [
  { id: "template", label: "Template", index: "01" },
  { id: "data", label: "Data", index: "02" },
  { id: "result", label: "Result", index: "03" },
] as const satisfies ReadonlyArray<{
  id: WorkspacePanel
  label: string
  index: string
}>

const idleActivity: Activity = {
  state: "idle",
  label: "Waiting for a template",
}

export function PlaygroundWorkspace() {
  const clientRef = useRef<BrowserRendererClient | undefined>(undefined)
  const pdfUrlLeaseRef = useRef<ObjectUrlLease | undefined>(undefined)
  const docxUrlLeaseRef = useRef<ObjectUrlLease | undefined>(undefined)
  const operationRef = useRef<AbortController | undefined>(undefined)
  const selectionSequenceRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [fileName, setFileName] = useState<string>()
  const [fileSize, setFileSize] = useState<number>()
  const [compiled, setCompiled] = useState<BrowserCompileResult>()
  const [data, setData] =
    useState<Readonly<Record<string, unknown>>>(SAMPLE_DATA)
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(SAMPLE_DATA, null, 2)
  )
  const [jsonError, setJsonError] = useState<string>()
  const [rendered, setRendered] = useState<BrowserRenderResult>()
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [docxUrl, setDocxUrl] = useState<string>()
  const [activity, setActivity] = useState<Activity>(idleActivity)
  const [mobilePanel, setMobilePanel] = useState<WorkspacePanel>("template")
  const [diagnostics, setDiagnostics] = useState<
    BrowserCompileResult["diagnostics"]
  >([])

  const createRenderer = useCallback((): BrowserRendererClient => {
    const worker = new Worker(
      new URL("../workers/render.worker.ts", import.meta.url),
      {
        type: "module",
      }
    )
    return new BrowserRendererClient(worker)
  }, [])

  useEffect(() => {
    const client = createRenderer()
    const pdfLease = new ObjectUrlLease()
    const docxLease = new ObjectUrlLease()
    clientRef.current = client
    pdfUrlLeaseRef.current = pdfLease
    docxUrlLeaseRef.current = docxLease
    setReady(true)
    return () => {
      operationRef.current?.abort()
      clientRef.current?.dispose()
      pdfLease.revoke()
      docxLease.revoke()
      clientRef.current = undefined
      pdfUrlLeaseRef.current = undefined
      docxUrlLeaseRef.current = undefined
    }
  }, [createRenderer])

  const runRender = useCallback(
    async (
      templateHash: string,
      renderData: Readonly<Record<string, unknown>>
    ): Promise<void> => {
      const client = clientRef.current
      if (!client) return
      operationRef.current?.abort()
      const controller = new AbortController()
      operationRef.current = controller
      setActivity({ state: "working", label: "Resolving data" })
      try {
        const result = await client.render(
          templateHash,
          renderData,
          PLAYGROUND_RENDER_OPTIONS,
          {
            signal: controller.signal,
            onProgress: (progress) =>
              setActivity({
                state: "working",
                label: describeWorkerProgress(progress),
                progress,
              }),
          }
        )
        const url = pdfUrlLeaseRef.current?.replace(
          result.pdf,
          "application/pdf"
        )
        setRendered(result)
        setPdfUrl(url)
        setDiagnostics(result.diagnostics)
        setMobilePanel("result")
        setActivity({
          state: "complete",
          label: `Rendered ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        handleFailure(error, setDiagnostics, setActivity)
      }
    },
    []
  )

  const compileBytes = useCallback(
    async (bytes: Uint8Array, name: string): Promise<void> => {
      const client = clientRef.current
      if (!client) return
      operationRef.current?.abort()
      const controller = new AbortController()
      operationRef.current = controller
      setFileName(name)
      setFileSize(bytes.byteLength)
      setCompiled(undefined)
      setRendered(undefined)
      setPdfUrl(undefined)
      pdfUrlLeaseRef.current?.revoke()
      setDocxUrl(docxUrlLeaseRef.current?.replace(bytes, DOCX_MIME))
      setDiagnostics([])
      setActivity({ state: "working", label: "Validating DOCX package" })
      try {
        const result = await client.compile(bytes, {
          signal: controller.signal,
          onProgress: (progress) =>
            setActivity({
              state: "working",
              label: describeWorkerProgress(progress),
              progress,
            }),
        })
        const starterData =
          name === "apex-sample.docx" ? SAMPLE_DATA : result.starterData
        setCompiled(result)
        setData(starterData)
        setJsonText(JSON.stringify(starterData, null, 2))
        setJsonError(undefined)
        setDiagnostics(result.diagnostics)
        setActivity({
          state: "complete",
          label: `Found ${result.manifest.fields.length} field${result.manifest.fields.length === 1 ? "" : "s"}`,
        })
        await runRender(result.templateHash, starterData)
      } catch (error) {
        if (controller.signal.aborted) return
        handleFailure(error, setDiagnostics, setActivity)
      }
    },
    [runRender]
  )

  const onFile = useCallback(
    async (file: File): Promise<void> => {
      const selection = selectionSequenceRef.current + 1
      selectionSequenceRef.current = selection
      operationRef.current?.abort()
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setActivity({ state: "error", label: "Choose a .docx template" })
        return
      }
      if (file.size > 20_000_000) {
        setActivity({
          state: "error",
          label: "Template exceeds the 20 MB demo limit",
        })
        return
      }
      setActivity({ state: "working", label: "Reading template bytes" })
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (selection !== selectionSequenceRef.current) return
      await compileBytes(bytes, file.name)
    },
    [compileBytes]
  )

  const onJsonChange = (next: string): void => {
    setJsonText(next)
    const result = parseTemplateJson(next)
    if (result.ok) {
      setData(result.data)
      setJsonError(undefined)
      return
    }
    setJsonError(formatJsonIssue(result.issue))
  }

  const commitData = (next: Readonly<Record<string, unknown>>): void => {
    setData(next)
    setJsonText(JSON.stringify(next, null, 2))
    setJsonError(undefined)
  }

  const updateField = (
    field: TemplateField,
    path: string,
    value: string | boolean
  ): void => {
    const parsedValue =
      field.kind === "number" ? (value === "" ? 0 : Number(value)) : value
    commitData(setPath(data, path, parsedValue))
  }

  const cancel = (): void => {
    selectionSequenceRef.current += 1
    operationRef.current?.abort()
    clientRef.current?.dispose()
    clientRef.current = createRenderer()
    setCompiled(undefined)
    setRendered(undefined)
    setPdfUrl(undefined)
    pdfUrlLeaseRef.current?.revoke()
    setDiagnostics([])
    setActivity({ state: "idle", label: "Operation cancelled" })
  }

  return (
    <div className="flex h-svh max-h-svh flex-col overflow-hidden bg-muted/20">
      <SiteHeader compact />
      <main className="flex max-h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-4 border-b bg-background px-4 py-4 sm:gap-5 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Document playground
              </h1>
              <Badge variant="secondary">Local-only</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Compile tables, images, sections, headers, and page fields in a
              Web Worker. Your document and data are never uploaded.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Status activity={activity} className="w-full sm:w-auto" />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {activity.state === "working" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
                  onClick={cancel}
                >
                  <HugeiconsIcon icon={Cancel02Icon} data-icon="inline-start" />
                  Cancel
                </Button>
              ) : null}
              <Button
                size="sm"
                className="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
                disabled={
                  !compiled ||
                  Boolean(jsonError) ||
                  activity.state === "working"
                }
                onClick={() =>
                  compiled && void runRender(compiled.templateHash, data)
                }
              >
                <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
                Render PDF
              </Button>
            </div>
          </div>
        </div>

        <div
          className="z-30 shrink-0 border-b bg-background xl:hidden"
          role="tablist"
          aria-label="Playground panels"
        >
          <div className="grid grid-cols-3">
            {workspacePanels.map((panel) => {
              const selected = mobilePanel === panel.id
              return (
                <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "relative min-h-12 px-2 py-3 text-center text-xs font-semibold tracking-wider uppercase transition-colors",
                    selected
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMobilePanel(panel.id)}
                >
                  <span className="mr-1.5 font-mono text-[10px] text-brand">
                    {panel.index}
                  </span>
                  {panel.label}
                  {selected ? (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 bg-foreground" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid max-h-full min-h-0 flex-1 xl:grid-cols-[minmax(280px,0.82fr)_minmax(340px,1fr)_minmax(440px,1.28fr)]">
          <div
            className={cn(
              "max-h-full min-h-0 min-w-0",
              mobilePanel === "template" ? "flex" : "hidden xl:flex"
            )}
          >
            <TemplatePanel
              ready={ready}
              fileName={fileName}
              fileSize={fileSize}
              compiled={compiled}
              docxUrl={docxUrl}
              diagnostics={diagnostics}
              onFile={onFile}
              onSample={() => {
                selectionSequenceRef.current += 1
                operationRef.current?.abort()
                void compileBytes(createSampleDocx(), "apex-sample.docx")
              }}
            />
          </div>
          <div
            className={cn(
              "max-h-full min-h-0 min-w-0",
              mobilePanel === "data" ? "flex" : "hidden xl:flex"
            )}
          >
            <DataPanel
              compiled={compiled}
              data={data}
              jsonText={jsonText}
              jsonError={jsonError}
              onJsonChange={onJsonChange}
              onFieldChange={updateField}
              onDataChange={commitData}
              onReset={() => {
                const next = compiled?.starterData ?? SAMPLE_DATA
                setData(next)
                setJsonText(JSON.stringify(next, null, 2))
                setJsonError(undefined)
              }}
            />
          </div>
          <div
            className={cn(
              "max-h-full min-h-0 min-w-0",
              mobilePanel === "result" ? "flex" : "hidden xl:flex"
            )}
          >
            <ResultPanel
              rendered={rendered}
              pdfUrl={pdfUrl}
              activity={activity}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

type TemplatePanelProps = Readonly<{
  ready: boolean
  fileName?: string
  fileSize?: number
  compiled?: BrowserCompileResult
  docxUrl?: string
  diagnostics: BrowserCompileResult["diagnostics"]
  onFile: (file: File) => Promise<void>
  onSample: () => void
}>

function TemplatePanel({
  ready,
  fileName,
  fileSize,
  compiled,
  docxUrl,
  diagnostics,
  onFile,
  onSample,
}: TemplatePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section
      className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col border-b bg-background xl:border-r xl:border-b-0"
      aria-labelledby="template-panel-title"
    >
      <PanelHeader
        index="01"
        title="Template"
        description="Inspect the bounded DOCX profile, including tables, images, and sections."
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 sm:p-5">
          <Input
            ref={inputRef}
            id="template-upload"
            className="sr-only"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={!ready}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
              event.target.value = ""
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              disabled={!ready}
              onClick={() => inputRef.current?.click()}
            >
              <HugeiconsIcon icon={Upload02Icon} data-icon="inline-start" />
              {fileName ? "Replace template" : "Choose template"}
            </Button>
            <Button variant="outline" disabled={!ready} onClick={onSample}>
              <HugeiconsIcon icon={File02Icon} data-icon="inline-start" />
              Use sample template
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            .docx · validated locally · 20 MB limit
          </p>

          {fileName ? (
            <div className="mt-4 border p-4">
              <p className="truncate text-sm font-medium" title={fileName}>
                {fileName}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                <span>{formatBytes(fileSize ?? 0)}</span>
                <span>
                  {compiled
                    ? `${compiled.templateHash.slice(0, 12)}…`
                    : "hashing…"}
                </span>
              </div>
            </div>
          ) : null}

          <Tabs defaultValue="preview" className="mt-6">
            <TabsList
              variant="line"
              className="w-full justify-start overflow-x-auto"
            >
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="features">Document features</TabsTrigger>
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="pt-5">
              <TemplatePreview docxUrl={docxUrl} fileName={fileName} />
              <p className="mt-3 border-l-2 border-brand pl-3 text-xs leading-5 text-muted-foreground">
                Placeholder highlighting is not available in this preview. The
                preview viewer is not connected to the engine’s placeholder node
                map, so use Fields to inspect detected paths.
              </p>
            </TabsContent>
            <TabsContent value="features" className="pt-5">
              <TemplateInspectionPanel
                compiled={compiled}
                isSample={fileName === "apex-sample.docx"}
              />
            </TabsContent>
            <TabsContent value="fields" className="pt-5">
              <FieldList fields={compiled?.manifest.fields ?? []} />
            </TabsContent>
            <TabsContent value="schema" className="pt-5">
              <CodeBlock
                value={
                  compiled
                    ? JSON.stringify(compiled.jsonSchema, null, 2)
                    : "Compile a template to generate JSON Schema."
                }
              />
            </TabsContent>
            <TabsContent value="diagnostics" className="pt-5">
              <DiagnosticList diagnostics={diagnostics} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </section>
  )
}

function TemplateInspectionPanel({
  compiled,
  isSample,
}: Readonly<{ compiled?: BrowserCompileResult; isSample: boolean }>) {
  if (!compiled) {
    return (
      <EmptyState
        title="No document features yet"
        description="Compile a template to inspect its manifest and the active browser profile."
      />
    )
  }

  const inspection = inspectTemplate(compiled)
  const diagnosticTotal =
    inspection.diagnosticCounts.error +
    inspection.diagnosticCounts.warning +
    inspection.diagnosticCounts.info

  return (
    <div className="space-y-6">
      <section aria-labelledby="detected-template-facts-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
              Detected template facts
            </p>
            <h3
              id="detected-template-facts-title"
              className="mt-1 text-sm font-semibold"
            >
              Public compile manifest
            </h3>
          </div>
          <Badge variant="secondary">
            {isSample ? "Bundled sample" : "Uploaded template"}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 border sm:grid-cols-3">
          <InspectionMetric label="Fields" value={inspection.fieldCount} />
          <InspectionMetric
            label="Required"
            value={inspection.requiredFields.length}
          />
          <InspectionMetric
            label="Array roots"
            value={inspection.arrayRoots.length}
          />
          <InspectionMetric
            label="Conditions"
            value={inspection.conditionalFields.length}
          />
          <InspectionMetric label="Diagnostics" value={diagnosticTotal} />
          <InspectionMetric
            label="Engine"
            value={compiled.engineVersion.replace("0.0.0-", "")}
          />
        </dl>

        <InspectionPathGroup
          title="Fields by kind"
          empty="No fields detected."
          values={inspection.fieldCountsByKind.map(
            ({ kind, count }) => `${kind} · ${count}`
          )}
        />
        <InspectionPathGroup
          title="Required fields"
          empty="No required fields detected."
          values={inspection.requiredFields}
        />
        <InspectionPathGroup
          title="Loops and array roots"
          empty="No manifest-backed loops or array roots detected."
          values={inspection.arrayRoots}
        />
        <InspectionPathGroup
          title="Conditional marker evidence"
          empty="No #if markers are represented in the public manifest."
          values={inspection.conditionalFields}
        />
      </section>

      <section
        className="border-t pt-5"
        aria-labelledby="profile-capabilities-title"
      >
        <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
          Profile capabilities
        </p>
        <h3
          id="profile-capabilities-title"
          className="mt-1 text-sm font-semibold"
        >
          {BROWSER_PROFILE_LABEL}
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          These describe renderer support, not features detected in this
          document. BrowserCompileResult does not expose per-template instances
          for these structures.
        </p>
        <div className="mt-4 divide-y border">
          {PROFILE_CAPABILITIES.map((capability) => (
            <div key={capability.label} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">{capability.label}</p>
                <Badge variant="secondary">{capability.support}</Badge>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {capability.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t pt-5" aria-labelledby="font-profile-title">
        <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
          Required font registry
        </p>
        <h3 id="font-profile-title" className="mt-1 text-sm font-semibold">
          {BUNDLED_FONT_PROFILE.family}
        </h3>
        <dl className="mt-4 space-y-3 border p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Bundled faces</dt>
            <dd className="mt-1 leading-5">
              {BUNDLED_FONT_PROFILE.faces.join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mapped aliases</dt>
            <dd className="mt-1 leading-5">
              {BUNDLED_FONT_PROFILE.aliases.join(", ")} →{" "}
              {BUNDLED_FONT_PROFILE.fallbackFamily}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registry hash</dt>
            <dd className="mt-1 font-mono text-[10px] break-all">
              {compiled.fontRegistryHash}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Font bytes stay bundled inside the worker and are not shown here.
        </p>
      </section>
    </div>
  )
}

function InspectionMetric({
  label,
  value,
}: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="min-w-0 border-r border-b p-3 last:border-r-0">
      <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm" title={String(value)}>
        {value}
      </dd>
    </div>
  )
}

function InspectionPathGroup({
  title,
  values,
  empty,
}: Readonly<{ title: string; values: readonly string[]; empty: string }>) {
  return (
    <div className="mt-4">
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h4>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <code
              key={value}
              className="max-w-full border bg-muted/20 px-2 py-1 font-mono text-[10px] break-all"
            >
              {value}
            </code>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

type DataPanelProps = Readonly<{
  compiled?: BrowserCompileResult
  data: Readonly<Record<string, unknown>>
  jsonText: string
  jsonError?: string
  onJsonChange: (value: string) => void
  onFieldChange: (
    field: TemplateField,
    path: string,
    value: string | boolean
  ) => void
  onDataChange: (value: Readonly<Record<string, unknown>>) => void
  onReset: () => void
}>

function DataPanel({
  compiled,
  data,
  jsonText,
  jsonError,
  onJsonChange,
  onFieldChange,
  onDataChange,
  onReset,
}: DataPanelProps) {
  const [clipboardStatus, setClipboardStatus] = useState<string>()

  const formatJson = (): void => {
    const parsed = parseTemplateJson(jsonText)
    if (!parsed.ok) {
      setClipboardStatus("Fix the JSON error before formatting.")
      return
    }
    onJsonChange(JSON.stringify(parsed.data, null, 2))
    setClipboardStatus("JSON formatted.")
  }

  const pasteJson = async (): Promise<void> => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.clipboard?.readText !== "function"
    ) {
      setClipboardStatus("Clipboard access is unavailable in this browser.")
      return
    }
    try {
      const pasted = await navigator.clipboard.readText()
      onJsonChange(pasted)
      setClipboardStatus("Clipboard contents pasted into the JSON editor.")
    } catch {
      setClipboardStatus("Clipboard permission was not granted.")
    }
  }

  const copyJson = async (): Promise<void> => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.clipboard?.writeText !== "function"
    ) {
      setClipboardStatus("Clipboard access is unavailable in this browser.")
      return
    }
    try {
      await navigator.clipboard.writeText(jsonText)
      setClipboardStatus("JSON copied to the clipboard.")
    } catch {
      setClipboardStatus("Clipboard permission was not granted.")
    }
  }

  return (
    <section
      className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col border-b bg-background xl:border-r xl:border-b-0"
      aria-labelledby="data-panel-title"
    >
      <PanelHeader
        index="02"
        title="Data"
        description="Edit generated fields or work directly in JSON."
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 sm:p-5">
          <Tabs defaultValue="form">
            <div className="flex items-center justify-between gap-3">
              <TabsList
                variant="line"
                className="min-w-0 flex-1 overflow-x-auto"
              >
                <TabsTrigger value="form">Form</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="xs" onClick={onReset}>
                <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" />
                Sample data
              </Button>
            </div>
            <TabsContent value="form" className="pt-6">
              {compiled?.manifest.fields.length ? (
                <div className="space-y-5">
                  {compiled.manifest.fields
                    .filter(isRootScalarField)
                    .map((field) => (
                      <FieldInput
                        key={field.path}
                        field={field}
                        value={getPath(data, field.path)}
                        concreteDataPath={field.path}
                        onChange={(value) =>
                          onFieldChange(field, field.path, value)
                        }
                      />
                    ))}
                  {compiled.manifest.fields
                    .filter(isRootArrayField)
                    .map((field) => (
                      <ArrayFieldEditor
                        key={field.path}
                        field={field}
                        fields={compiled.manifest.fields}
                        indexes={[]}
                        data={data}
                        onFieldChange={onFieldChange}
                        onDataChange={onDataChange}
                      />
                    ))}
                </div>
              ) : (
                <EmptyState
                  title="No generated fields yet"
                  description="Compile a DOCX template and its placeholders will appear here."
                />
              )}
            </TabsContent>
            <TabsContent value="json" className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label htmlFor="template-json">Template data</Label>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={formatJson}>
                    Format
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void pasteJson()}
                  >
                    Paste
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy JSON"
                    onClick={() => void copyJson()}
                  >
                    <HugeiconsIcon icon={CopyIcon} />
                  </Button>
                </div>
              </div>
              <JsonEditor
                id="template-json"
                className="mt-3"
                value={jsonText}
                invalid={Boolean(jsonError)}
                minHeight={320}
                aria-describedby={jsonError ? "json-error" : "json-hint"}
                onChange={onJsonChange}
              />
              {jsonError ? (
                <p
                  id="json-error"
                  className="mt-2 text-xs text-destructive"
                  role="alert"
                >
                  {jsonError}
                </p>
              ) : (
                <p
                  id="json-hint"
                  className="mt-2 text-xs text-muted-foreground"
                >
                  Valid JSON object · fields are resolved strictly
                </p>
              )}
              <p className="sr-only" role="status" aria-live="polite">
                {clipboardStatus}
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </section>
  )
}

function ResultPanel({
  rendered,
  pdfUrl,
  activity,
}: Readonly<{
  rendered?: BrowserRenderResult
  pdfUrl?: string
  activity: Activity
}>) {
  return (
    <section
      className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col bg-muted/20"
      aria-labelledby="result-panel-title"
    >
      <PanelHeader
        index="03"
        title="Result"
        description="The PDF uses the engine’s measured display list."
      />
      <div className="flex max-h-full min-h-0 flex-1 flex-col p-4 sm:p-5">
        {rendered && pdfUrl ? (
          <>
            <div className="mb-4 flex shrink-0 flex-wrap gap-2">
              <Badge>
                {rendered.pageCount} page{rendered.pageCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary">
                {rendered.timings.totalMs.toFixed(1)} ms
              </Badge>
              <Badge variant="secondary">
                {formatBytes(rendered.pdf.byteLength)}
              </Badge>
            </div>
            <PDFViewer
              key={pdfUrl}
              src={pdfUrl}
              fileName="apex-render.pdf"
              className="min-h-0 flex-1 overflow-hidden border bg-background shadow-xl ring-1 ring-foreground/10"
              showUpload={false}
              showDownload
            />
          </>
        ) : activity.state === "working" ? (
          <div className="grid min-h-0 flex-1 place-items-center border bg-background">
            <div className="max-w-xs px-4 text-center">
              <span className="mx-auto block size-3 animate-pulse bg-brand motion-reduce:animate-none" />
              <p className="mt-5 text-sm font-medium">{activity.label}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Work stays inside the browser worker.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center border border-dashed bg-background/60">
            <EmptyState
              title="Your PDF will appear here"
              description="Use the sample template or upload a supported DOCX to render the first page."
            />
          </div>
        )}
      </div>
    </section>
  )
}

function PanelHeader({
  index,
  title,
  description,
}: Readonly<{ index: string; title: string; description: string }>) {
  return (
    <div className="shrink-0 bg-background xl:border-b xl:px-5 xl:py-4">
      <div className="flex items-baseline gap-3">
        <span className="hidden font-mono text-[10px] tracking-widest text-brand xl:inline">
          {index}
        </span>
        <h2
          id={`${title.toLowerCase()}-panel-title`}
          className="sr-only text-sm font-semibold xl:not-sr-only"
        >
          {title}
        </h2>
      </div>
      <p className="mt-1 hidden pl-8 text-xs leading-5 text-muted-foreground xl:block">
        {description}
      </p>
    </div>
  )
}

function Status({
  activity,
  className,
}: Readonly<{ activity: Activity; className?: string }>) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-2 border px-3 text-xs sm:min-h-9",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={
          activity.state === "working"
            ? "size-2 shrink-0 animate-pulse bg-brand motion-reduce:animate-none"
            : activity.state === "error"
              ? "size-2 shrink-0 bg-destructive"
              : activity.state === "complete"
                ? "size-2 shrink-0 bg-emerald-500"
                : "size-2 shrink-0 bg-muted-foreground/40"
        }
      />
      <span className="min-w-0 flex-1 truncate sm:max-w-64 sm:flex-none">
        {activity.label}
      </span>
      {activity.progress ? (
        <span className="shrink-0 text-muted-foreground">
          {activity.progress.completed}/{activity.progress.total}
        </span>
      ) : null}
    </div>
  )
}

function TemplatePreview({
  docxUrl,
  fileName,
}: Readonly<{ docxUrl?: string; fileName?: string }>) {
  const [isDark, setIsDark] = useState(false)

  if (!docxUrl) {
    return (
      <EmptyState
        title="No template loaded"
        description="The DOCX preview will appear after you upload or open a sample template."
      />
    )
  }

  return (
    <DocxViewerPreview
      key={docxUrl}
      src={docxUrl}
      fileName={fileName}
      isDark={isDark}
      onIsDarkChange={setIsDark}
      showUpload={false}
      className="h-[min(48svh,420px)] overflow-hidden border bg-background"
    />
  )
}

function FieldList({ fields }: Readonly<{ fields: readonly TemplateField[] }>) {
  if (!fields.length)
    return (
      <EmptyState
        title="No fields discovered"
        description="Upload or open the sample template to inspect placeholders."
      />
    )
  return (
    <div className="divide-y border">
      {fields.map((field) => (
        <div
          key={field.path}
          className="flex items-start justify-between gap-3 p-3"
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{field.path}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {field.sourceLocations[0]?.part}
            </p>
          </div>
          <Badge variant="secondary">{field.kind}</Badge>
        </div>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  concreteDataPath,
  onChange,
}: Readonly<{
  field: TemplateField
  value: unknown
  concreteDataPath: string
  onChange: (value: string | boolean) => void
}>) {
  const id = `field-${concreteDataPath.replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label
          htmlFor={id}
          className="min-w-0 truncate font-mono text-xs tracking-normal normal-case"
        >
          {field.path}
          {field.required ? (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          ) : null}
          {field.required ? <span className="sr-only">(required)</span> : null}
        </Label>
        <span className="shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          {field.kind}
        </span>
      </div>
      {field.kind === "boolean" ? (
        <label
          className="flex min-h-11 items-center gap-3 border px-3 text-sm"
          htmlFor={id}
        >
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            required={field.required}
            onChange={(event) => onChange(event.target.checked)}
          />
          {value === true ? "True" : "False"}
        </label>
      ) : (
        <Input
          id={id}
          type={
            field.kind === "number"
              ? "number"
              : field.kind === "date"
                ? "date"
                : "text"
          }
          value={
            typeof value === "string" || typeof value === "number"
              ? String(value).slice(0, field.kind === "date" ? 10 : undefined)
              : ""
          }
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

type FieldChangeHandler = (
  field: TemplateField,
  path: string,
  value: string | boolean
) => void

function ArrayFieldEditor({
  field,
  fields,
  indexes,
  data,
  onFieldChange,
  onDataChange,
}: Readonly<{
  field: TemplateField
  fields: readonly TemplateField[]
  indexes: readonly number[]
  data: Readonly<Record<string, unknown>>
  onFieldChange: FieldChangeHandler
  onDataChange: (value: Readonly<Record<string, unknown>>) => void
}>) {
  const path = concretePath(field.path, indexes)
  const value = path ? getPath(data, path) : undefined
  const rows = Array.isArray(value) ? value : []
  const itemDepth = countArrayMarkers(field.path) + 1
  const itemPrefix = `${field.path}[]`
  const scalarFields = fields.filter(
    (candidate) =>
      isScalarField(candidate) &&
      candidate.path.startsWith(`${itemPrefix}.`) &&
      countArrayMarkers(candidate.path) === itemDepth
  )
  const childArrays = fields.filter(
    (candidate) =>
      candidate.kind === "array" &&
      candidate.path.startsWith(`${itemPrefix}.`) &&
      countArrayMarkers(candidate.path) === itemDepth
  )
  const headingId = `array-${(path ?? field.path).replaceAll(
    /[^a-zA-Z0-9_-]/gu,
    "-"
  )}`
  const rowKeysRef = useRef<string[]>([])
  const rowSequenceRef = useRef(0)
  while (rowKeysRef.current.length < rows.length) {
    rowKeysRef.current.push(`${headingId}-row-${rowSequenceRef.current}`)
    rowSequenceRef.current += 1
  }
  if (rowKeysRef.current.length > rows.length) {
    rowKeysRef.current.length = rows.length
  }
  const keyedRows = rows.map((row, rowIndex) => ({
    row,
    rowIndex,
    key: rowKeysRef.current[rowIndex],
  }))

  return (
    <fieldset className="min-w-0 border p-4" aria-labelledby={headingId}>
      <legend className="sr-only">{field.path}</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              id={headingId}
              className="truncate font-mono text-xs font-medium"
            >
              {field.path}
            </h3>
            {field.required ? (
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            ) : null}
            {field.required ? <span className="sr-only">required</span> : null}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "row" : "rows"}
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11 sm:min-h-7"
          variant="outline"
          size="xs"
          disabled={!path}
          aria-label={`Add row to ${field.path}`}
          onClick={() => {
            if (!path) return
            onDataChange(
              addArrayItem(data, path, createArrayItem(field, fields))
            )
          }}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Add row
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 border border-dashed bg-muted/20 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No rows. Add one to provide repeated data.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {keyedRows.map(({ rowIndex, key }) => {
            const rowIndexes = [...indexes, rowIndex]
            return (
              <div key={key} className="min-w-0 border bg-muted/10 p-4">
                <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
                  <p className="text-xs font-medium">Row {rowIndex + 1}</p>
                  <Button
                    type="button"
                    className="size-11 sm:size-8"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!path}
                    aria-label={`Remove row ${rowIndex + 1} from ${field.path}`}
                    onClick={() => {
                      if (!path) return
                      rowKeysRef.current.splice(rowIndex, 1)
                      onDataChange(removeArrayItem(data, path, rowIndex))
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </div>
                <div className="space-y-5">
                  {scalarFields.map((candidate) => {
                    const candidatePath = concretePath(
                      candidate.path,
                      rowIndexes
                    )
                    if (!candidatePath) return null
                    return (
                      <FieldInput
                        key={candidate.path}
                        field={candidate}
                        concreteDataPath={candidatePath}
                        value={getPath(data, candidatePath)}
                        onChange={(next) =>
                          onFieldChange(candidate, candidatePath, next)
                        }
                      />
                    )
                  })}
                  {childArrays.map((candidate) => (
                    <ArrayFieldEditor
                      key={candidate.path}
                      field={candidate}
                      fields={fields}
                      indexes={rowIndexes}
                      data={data}
                      onFieldChange={onFieldChange}
                      onDataChange={onDataChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

function isScalarField(field: TemplateField): boolean {
  return field.kind !== "array" && field.kind !== "object"
}

function isRootScalarField(field: TemplateField): boolean {
  return isScalarField(field) && !field.path.includes("[]")
}

function isRootArrayField(field: TemplateField): boolean {
  return field.kind === "array" && !field.path.includes("[]")
}

function countArrayMarkers(path: string): number {
  return path.match(/\[\]/gu)?.length ?? 0
}

function createArrayItem(
  field: TemplateField,
  fields: readonly TemplateField[]
): Readonly<Record<string, unknown>> {
  const itemPrefix = `${field.path}[].`
  const itemDepth = countArrayMarkers(field.path) + 1
  let item: Readonly<Record<string, unknown>> = {}

  for (const candidate of fields) {
    if (!candidate.path.startsWith(itemPrefix)) continue
    if (countArrayMarkers(candidate.path) !== itemDepth) continue
    const relativePath = candidate.path.slice(itemPrefix.length)
    if (!relativePath || relativePath.includes("[]")) continue
    if (candidate.kind === "object") continue
    item = setPath(
      item,
      relativePath,
      candidate.kind === "array" ? [] : starterValue(candidate)
    )
  }
  return item
}

function starterValue(field: TemplateField): string | number | boolean {
  if (field.kind === "number") return 0
  if (field.kind === "boolean") return false
  return ""
}

function DiagnosticList({
  diagnostics,
}: Readonly<{ diagnostics: BrowserCompileResult["diagnostics"] }>) {
  if (!diagnostics.length) {
    return (
      <div className="flex items-center gap-3 border p-4 text-sm">
        <HugeiconsIcon
          className="size-4 text-emerald-600"
          icon={CheckmarkCircle02Icon}
        />
        <span>No diagnostics for the current operation.</span>
      </div>
    )
  }
  const occurrences = new Map<string, number>()
  const keyedDiagnostics = diagnostics.map((diagnostic) => {
    const base = [
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
      diagnostic.source?.part ?? "",
      diagnostic.source?.xmlPath ?? "",
      diagnostic.nodeId ?? "",
    ].join("|")
    const occurrence = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, occurrence)
    return { diagnostic, key: `${base}|${occurrence}` }
  })
  return (
    <div className="space-y-2">
      {keyedDiagnostics.map(({ diagnostic, key }) => (
        <div key={key} className="border p-3">
          <div className="flex items-center justify-between gap-3">
            <code className="font-mono text-[10px]">{diagnostic.code}</code>
            <Badge
              variant={
                diagnostic.severity === "error" ? "destructive" : "secondary"
              }
            >
              {diagnostic.severity}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {diagnostic.message}
          </p>
        </div>
      ))}
    </div>
  )
}

function CodeBlock({ value }: Readonly<{ value: string }>) {
  return (
    <pre className="overflow-x-auto border bg-muted/30 p-4 font-mono text-[10px] leading-5 whitespace-pre">
      <code>{value}</code>
    </pre>
  )
}

function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="mx-auto max-w-xs py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function handleFailure(
  error: unknown,
  setDiagnostics: (diagnostics: BrowserCompileResult["diagnostics"]) => void,
  setActivity: (activity: Activity) => void
): void {
  if (error instanceof BrowserRenderError) {
    setDiagnostics(error.diagnostics)
    setActivity({ state: "error", label: error.message })
    return
  }
  setActivity({
    state: "error",
    label: error instanceof Error ? error.message : "The operation failed",
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
