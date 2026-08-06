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
} from "@apexmed/browser"
import type {
  BrowserCompileResult,
  BrowserRenderResult,
  WorkerProgress,
} from "@apexmed/browser"
import type { RenderOptions, TemplateField } from "@apexmed/core"
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ConvexPersistence } from "@/components/convex-persistence"
import { EngineTemplatePreview } from "@/components/engine-template-preview"
import { PDFViewer } from "@/components/extend/pdf-viewer"
import { FontCatalogSpecimens } from "@/components/font-catalog-specimens"
import { JsonEditor } from "@/components/json-editor"
import { SiteHeader } from "@/components/site-header"
import { formatJsonIssue, parseTemplateJson } from "@/lib/json-editor"
import {
  dateFieldFormats,
  dateFieldInputPrecision,
  fieldValidationMessages,
  formatTemplateDataErrors,
  parseFiniteNumberInput,
  playgroundDateInputToIso,
  playgroundDateInputValue,
  readPlaygroundImage,
  validateTemplateData,
  type PlaygroundImageValue,
  type TemplateDataIssue,
} from "@/lib/playground-data"
import {
  emptyPlaygroundTemplateMetadata,
  initialPlaygroundRenderRevision,
  invalidatePlaygroundRender,
  isPlaygroundRenderCurrent,
} from "@/lib/playground-freshness"
import {
  addArrayItem,
  concretePath,
  getPath,
  removeArrayItem,
  setPath,
} from "@/lib/form-data"
import { SAMPLE_DATA, createSampleDocx } from "@/lib/sample-docx"
import {
  BUNDLED_FONT_PROFILE,
  describeWorkerProgress,
  inspectTemplate,
} from "@/lib/template-inspection"

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

export function PlaygroundWorkspace({
  convexEnabled,
}: Readonly<{ convexEnabled: boolean }>) {
  const clientRef = useRef<BrowserRendererClient | undefined>(undefined)
  const pdfUrlLeaseRef = useRef<ObjectUrlLease | undefined>(undefined)
  const operationRef = useRef<AbortController | undefined>(undefined)
  const selectionSequenceRef = useRef(0)
  const renderRevisionRef = useRef(initialPlaygroundRenderRevision)
  const [ready, setReady] = useState(false)
  const [fileName, setFileName] = useState<string>()
  const [fileSize, setFileSize] = useState<number>()
  const [templateBytes, setTemplateBytes] = useState<Uint8Array<ArrayBuffer>>()
  const [compiled, setCompiled] = useState<BrowserCompileResult>()
  const [data, setData] =
    useState<Readonly<Record<string, unknown>>>(SAMPLE_DATA)
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(SAMPLE_DATA, null, 2)
  )
  const [jsonError, setJsonError] = useState<string>()
  const [rendered, setRendered] = useState<BrowserRenderResult>()
  const [renderedData, setRenderedData] =
    useState<Readonly<Record<string, unknown>>>()
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [activity, setActivity] = useState<Activity>(idleActivity)
  const [mobilePanel, setMobilePanel] = useState<WorkspacePanel>("template")
  const [diagnostics, setDiagnostics] = useState<
    BrowserCompileResult["diagnostics"]
  >([])
  const dataValidation = useMemo(
    () =>
      compiled ? validateTemplateData(compiled.jsonSchema, data) : undefined,
    [compiled, data]
  )

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
    clientRef.current = client
    pdfUrlLeaseRef.current = pdfLease
    setReady(true)
    return () => {
      operationRef.current?.abort()
      clientRef.current?.dispose()
      pdfLease.revoke()
      clientRef.current = undefined
      pdfUrlLeaseRef.current = undefined
    }
  }, [createRenderer])

  const clearRenderedOutput = useCallback((): void => {
    setRendered(undefined)
    setRenderedData(undefined)
    setPdfUrl(undefined)
    pdfUrlLeaseRef.current?.revoke()
  }, [])

  const invalidateRenderedOutput = useCallback((): void => {
    renderRevisionRef.current = invalidatePlaygroundRender(
      renderRevisionRef.current
    )
    operationRef.current?.abort()
    clearRenderedOutput()
    setActivity({ state: "idle", label: "Data changed — render again" })
  }, [clearRenderedOutput])

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
      const renderRevision = renderRevisionRef.current
      clearRenderedOutput()
      setActivity({ state: "working", label: "Resolving data" })
      try {
        const result = await client.render(
          templateHash,
          renderData,
          PLAYGROUND_RENDER_OPTIONS,
          {
            signal: controller.signal,
            onProgress: (progress) => {
              if (
                controller.signal.aborted ||
                operationRef.current !== controller ||
                !isPlaygroundRenderCurrent(
                  renderRevisionRef.current,
                  renderRevision
                )
              )
                return
              setActivity({
                state: "working",
                label: describeWorkerProgress(progress),
                progress,
              })
            },
          }
        )
        if (
          controller.signal.aborted ||
          operationRef.current !== controller ||
          !isPlaygroundRenderCurrent(renderRevisionRef.current, renderRevision)
        )
          return
        const url = pdfUrlLeaseRef.current?.replace(
          result.pdf,
          "application/pdf"
        )
        setRendered(result)
        setRenderedData(renderData)
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
      } finally {
        if (operationRef.current === controller)
          operationRef.current = undefined
      }
    },
    [clearRenderedOutput]
  )

  const compileBytes = useCallback(
    async (bytes: Uint8Array, name: string): Promise<void> => {
      const client = clientRef.current
      if (!client) return
      invalidateRenderedOutput()
      const controller = new AbortController()
      operationRef.current = controller
      setFileName(name)
      setFileSize(bytes.byteLength)
      setTemplateBytes(new Uint8Array(bytes))
      setCompiled(undefined)
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
        const starterError = schemaError(result, starterData)
        setCompiled(result)
        setData(starterData)
        setJsonText(JSON.stringify(starterData, null, 2))
        setJsonError(starterError)
        setDiagnostics(result.diagnostics)
        setActivity({
          state: "complete",
          label: `Found ${result.manifest.fields.length} field${result.manifest.fields.length === 1 ? "" : "s"}`,
        })
        if (!starterError) await runRender(result.templateHash, starterData)
      } catch (error) {
        if (controller.signal.aborted) return
        handleFailure(error, setDiagnostics, setActivity)
      } finally {
        if (operationRef.current === controller)
          operationRef.current = undefined
      }
    },
    [invalidateRenderedOutput, runRender]
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
    invalidateRenderedOutput()
    setJsonText(next)
    const result = parseTemplateJson(next)
    if (result.ok) {
      setData(result.data)
      setJsonError(compiled ? schemaError(compiled, result.data) : undefined)
      return
    }
    setJsonError(formatJsonIssue(result.issue))
  }

  const commitData = (next: Readonly<Record<string, unknown>>): void => {
    invalidateRenderedOutput()
    setData(next)
    setJsonText(JSON.stringify(next, null, 2))
    setJsonError(compiled ? schemaError(compiled, next) : undefined)
  }

  const updateField = (
    field: TemplateField,
    path: string,
    value: unknown
  ): void => {
    const numberValue =
      field.kind === "number" && typeof value === "string"
        ? parseFiniteNumberInput(value)
        : undefined
    if (
      field.kind === "number" &&
      typeof value === "string" &&
      numberValue === undefined
    )
      return
    const dateValue =
      field.kind === "date" && typeof value === "string" && value !== ""
        ? playgroundDateInputToIso(
            value,
            dateFieldInputPrecision(field),
            PLAYGROUND_RENDER_OPTIONS.timeZone
          )
        : undefined
    if (
      field.kind === "date" &&
      typeof value === "string" &&
      value !== "" &&
      dateValue === undefined
    )
      return
    const parsedValue =
      field.kind === "number" && typeof value === "string"
        ? numberValue
        : field.kind === "date" && typeof value === "string" && value !== ""
          ? dateValue
          : value
    commitData(setPath(data, path, parsedValue))
  }

  const cancel = (): void => {
    selectionSequenceRef.current += 1
    invalidateRenderedOutput()
    clientRef.current?.dispose()
    clientRef.current = createRenderer()
    operationRef.current = undefined
    const emptyMetadata = emptyPlaygroundTemplateMetadata()
    setFileName(emptyMetadata.fileName)
    setFileSize(emptyMetadata.fileSize)
    setCompiled(undefined)
    setTemplateBytes(undefined)
    setData(SAMPLE_DATA)
    setJsonText(JSON.stringify(SAMPLE_DATA, null, 2))
    setJsonError(undefined)
    setDiagnostics([])
    setMobilePanel("template")
    setActivity({ state: "idle", label: "Operation cancelled" })
  }

  const removeTemplate = (): void => {
    selectionSequenceRef.current += 1
    invalidateRenderedOutput()
    clientRef.current?.dispose()
    clientRef.current = createRenderer()
    operationRef.current = undefined
    setFileName(undefined)
    setFileSize(undefined)
    setTemplateBytes(undefined)
    setCompiled(undefined)
    setData(SAMPLE_DATA)
    setJsonText(JSON.stringify(SAMPLE_DATA, null, 2))
    setJsonError(undefined)
    setDiagnostics([])
    setMobilePanel("template")
    setActivity(idleActivity)
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
              <Badge variant="secondary">
                {convexEnabled ? "Local-first" : "Local-only"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Compile tables, images, sections, headers, and page fields in a
              Web Worker.
              {convexEnabled
                ? " Nothing uploads unless you enable persistence and save."
                : " Your document and data are never uploaded."}
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

        {convexEnabled ? (
          <details className="group shrink-0 border-b bg-background">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-xs font-semibold tracking-wider uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5 lg:px-8">
              <span>Optional cloud persistence</span>
              <span className="text-muted-foreground group-open:hidden">
                Off
              </span>
              <span className="hidden text-brand group-open:inline">Open</span>
            </summary>
            <div className="max-h-[48svh] overflow-y-auto border-t p-4 sm:p-5 lg:px-8">
              <div className="mx-auto max-w-3xl">
                <ConvexPersistence
                  compiled={compiled}
                  rendered={rendered}
                  renderedData={renderedData}
                  templateBytes={templateBytes}
                  fileName={fileName}
                  data={data}
                  renderOptions={PLAYGROUND_RENDER_OPTIONS}
                  resetKey={`${compiled?.templateHash ?? "none"}:${fileName ?? "none"}`}
                />
              </div>
            </div>
          </details>
        ) : null}

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
                  id={`playground-tab-${panel.id}`}
                  aria-controls={`playground-panel-${panel.id}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    "relative min-h-12 px-2 py-3 text-center text-xs font-semibold tracking-wider uppercase transition-colors",
                    selected
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMobilePanel(panel.id)}
                  onKeyDown={(event) => {
                    const nextPanel = panelForKey(event.key, panel.id)
                    if (!nextPanel) return
                    event.preventDefault()
                    setMobilePanel(nextPanel)
                    document
                      .getElementById(`playground-tab-${nextPanel}`)
                      ?.focus()
                  }}
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
            id="playground-panel-template"
            role="tabpanel"
            aria-labelledby="playground-tab-template"
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
              diagnostics={diagnostics}
              onFile={onFile}
              onSample={() => {
                selectionSequenceRef.current += 1
                operationRef.current?.abort()
                void compileBytes(createSampleDocx(), "apex-sample.docx")
              }}
              onRemove={removeTemplate}
            />
          </div>
          <div
            id="playground-panel-data"
            role="tabpanel"
            aria-labelledby="playground-tab-data"
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
              validationIssues={dataValidation?.issues ?? []}
              onJsonChange={onJsonChange}
              onFieldChange={updateField}
              onDataChange={commitData}
              onReset={() => {
                const next = compiled?.starterData ?? SAMPLE_DATA
                commitData(next)
              }}
            />
          </div>
          <div
            id="playground-panel-result"
            role="tabpanel"
            aria-labelledby="playground-tab-result"
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
  diagnostics: BrowserCompileResult["diagnostics"]
  onFile: (file: File) => Promise<void>
  onSample: () => void
  onRemove: () => void
}>

function TemplatePanel({
  ready,
  fileName,
  fileSize,
  compiled,
  diagnostics,
  onFile,
  onSample,
  onRemove,
}: TemplatePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  return (
    <section
      className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col border-b bg-background xl:border-r xl:border-b-0"
      aria-labelledby="template-panel-title"
    >
      <PanelHeader
        index="01"
        title="Template"
        description="Inspect the bounded DOCX profile."
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 sm:p-5">
          <Input
            ref={inputRef}
            id="template-upload"
            className="sr-only"
            type="file"
            aria-label="Choose DOCX template"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={!ready}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
              event.target.value = ""
            }}
          />
          <fieldset
            className={cn(
              "border border-dashed p-4 transition-colors",
              dragActive ? "border-brand bg-brand/5" : "bg-muted/10"
            )}
            onDragEnter={(event) => {
              event.preventDefault()
              if (ready) setDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (ready) event.dataTransfer.dropEffect = "copy"
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null
                )
              ) {
                setDragActive(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              const file = event.dataTransfer.files[0]
              if (ready && file) void onFile(file)
            }}
          >
            <legend className="sr-only">DOCX template upload</legend>
            <p className="text-center text-xs text-muted-foreground">
              Drag and drop a DOCX template here, or use the file picker.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
          </fieldset>
          <p className="mt-2 text-xs text-muted-foreground">
            .docx · validated locally · 20 MB limit
          </p>

          {fileName ? (
            <div className="mt-4 border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={onRemove}
                >
                  <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                  Remove template
                </Button>
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
              <TemplatePreview compiled={compiled} />
              {compiled ? (
                <p className="mt-3 border-l-2 border-brand pl-3 text-xs leading-5 text-muted-foreground">
                  The engine lays out the unresolved template source.
                  Highlighted runs are linked to canonical field paths through
                  its placeholder node map.
                </p>
              ) : null}
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
            label="Preview pages"
            value={inspection.previewPageCount}
          />
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
        aria-labelledby="detected-features-title"
      >
        <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
          Detected document structures
        </p>
        <h3 id="detected-features-title" className="mt-1 text-sm font-semibold">
          Template-specific feature instances
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Counts cover the bounded semantic document model. Source paths show up
          to {compiled.inspection.sourceLimitPerEntry} instances per feature.
        </p>
        <div className="mt-4 divide-y border">
          {inspection.features.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {inspection.documentModelAvailable
                ? "No modeled document structures detected."
                : "A semantic document model was not available; see diagnostics."}
            </p>
          ) : (
            inspection.features.map((feature) => (
              <div key={feature.kind} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium">
                    {formatFeatureKind(feature.kind)}
                  </p>
                  <Badge
                    variant={
                      feature.support === "unsupported"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {feature.instanceCount} · {feature.support}
                  </Badge>
                </div>
                <InspectionSources
                  sources={feature.sources}
                  truncated={feature.sourcesTruncated}
                />
              </div>
            ))
          )}
        </div>
        {compiled.inspection.featuresTruncated ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Showing {compiled.inspection.entryLimit} of{" "}
            {compiled.inspection.featureEntryCount} feature kinds.
          </p>
        ) : null}
      </section>

      <section className="border-t pt-5" aria-labelledby="font-profile-title">
        <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
          Required font faces
        </p>
        <h3 id="font-profile-title" className="mt-1 text-sm font-semibold">
          Template-specific typography
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          These are the family, weight, and style combinations requested by this
          document. Aliases and fallback resolution happen inside the worker.
        </p>
        <div className="mt-4 divide-y border">
          {inspection.requiredFonts.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No font requests were available from the semantic model.
            </p>
          ) : (
            inspection.requiredFonts.map((font) => (
              <div
                key={`${font.family}-${font.weight}-${font.style}`}
                className="p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium">{font.family}</p>
                  <Badge variant="secondary">
                    {font.weight} · {font.style} · {font.instanceCount}
                  </Badge>
                </div>
                <InspectionSources
                  sources={font.sources}
                  truncated={font.sourcesTruncated}
                />
              </div>
            ))
          )}
        </div>
        {compiled.inspection.requiredFontsTruncated ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Showing {compiled.inspection.entryLimit} of{" "}
            {compiled.inspection.requiredFontEntryCount} requested faces.
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Source samples are capped at {compiled.inspection.sourceLimitPerEntry}{" "}
          per face; counts remain complete within parser resource limits.
        </p>
      </section>

      <section
        className="border-t pt-5"
        aria-labelledby="bundled-font-catalog-title"
      >
        <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
          Always available
        </p>
        <h3
          id="bundled-font-catalog-title"
          className="mt-1 text-sm font-semibold"
        >
          Bundled offline font catalog
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Every specimen below uses the same pinned static TrueType asset that
          the browser worker can embed in a PDF.
        </p>
        <FontCatalogSpecimens />
        <dl className="mt-4 space-y-3 border p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Bundled families</dt>
            <dd className="mt-1 leading-5">
              {BUNDLED_FONT_PROFILE.families.join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mapped aliases</dt>
            <dd className="mt-1 leading-5">
              {BUNDLED_FONT_PROFILE.aliases.join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registry hash</dt>
            <dd className="mt-1 font-mono text-[10px] break-all">
              {compiled.fontRegistryHash}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function InspectionSources({
  sources,
  truncated,
}: Readonly<{
  sources: BrowserCompileResult["inspection"]["features"][number]["sources"]
  truncated: boolean
}>) {
  return (
    <div className="mt-2 space-y-1 font-mono text-[10px] leading-4 text-muted-foreground">
      {sources.map((source) => (
        <p
          key={`${source.part}:${source.xmlPath}:${source.line ?? ""}:${source.column ?? ""}`}
          className="break-all"
        >
          {source.part} · {source.xmlPath}
        </p>
      ))}
      {truncated ? <p>Additional source locations omitted.</p> : null}
    </div>
  )
}

function formatFeatureKind(kind: string): string {
  const value = kind.startsWith("unsupported:")
    ? `Unsupported · ${kind.slice("unsupported:".length)}`
    : kind
  return value.replace(/([a-z])([A-Z])/g, "$1 $2")
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
  validationIssues: readonly TemplateDataIssue[]
  onJsonChange: (value: string) => void
  onFieldChange: (field: TemplateField, path: string, value: unknown) => void
  onDataChange: (value: Readonly<Record<string, unknown>>) => void
  onReset: () => void
}>

function DataPanel({
  compiled,
  data,
  jsonText,
  jsonError,
  validationIssues,
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
                        validationIssues={validationIssues}
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
                        validationIssues={validationIssues}
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
            <div className="mb-4 grid shrink-0 gap-px border bg-border sm:grid-cols-4">
              <TimingMetric
                label="Resolve"
                value={rendered.timings.resolveMs}
              />
              <TimingMetric label="Layout" value={rendered.timings.layoutMs} />
              <TimingMetric label="PDF" value={rendered.timings.pdfMs} />
              <TimingMetric label="Total" value={rendered.timings.totalMs} />
            </div>
            <details className="group mb-4 shrink-0 border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold tracking-wide uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <span>Render diagnostics</span>
                <span className="text-muted-foreground">
                  {rendered.diagnostics.length === 0
                    ? "None"
                    : rendered.diagnostics.length}
                </span>
              </summary>
              <div className="border-t p-3">
                <DiagnosticList diagnostics={rendered.diagnostics} />
              </div>
            </details>
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

function TimingMetric({
  label,
  value,
}: Readonly<{ label: string; value: number }>) {
  return (
    <div className="min-w-0 bg-background px-3 py-2.5">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums">
        {value.toFixed(1)} ms
      </p>
    </div>
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
  compiled,
}: Readonly<{ compiled?: BrowserCompileResult }>) {
  if (!compiled) {
    return (
      <EmptyState
        title="No template loaded"
        description="The engine preview will appear after you upload or open a sample template."
      />
    )
  }

  return <EngineTemplatePreview preview={compiled.templatePreview} />
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
  validationIssues,
  onChange,
}: Readonly<{
  field: TemplateField
  value: unknown
  concreteDataPath: string
  validationIssues: readonly TemplateDataIssue[]
  onChange: (value: unknown) => void
}>) {
  const id = `field-${concreteDataPath.replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`
  const errors = fieldValidationMessages(
    validationIssues,
    concreteDataPath,
    field.kind === "image"
  )
  const errorId = `${id}-validation-error`
  const invalid = errors.length > 0
  const datePrecision =
    field.kind === "date" ? dateFieldInputPrecision(field) : undefined
  const dateFormats = field.kind === "date" ? dateFieldFormats(field) : []
  const dateDescriptionId = `${id}-date-description`
  const describedBy = [
    ...(field.kind === "date" ? [dateDescriptionId] : []),
    ...(invalid ? [errorId] : []),
  ].join(" ")
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
      {field.kind === "image" ? (
        <ImageFieldInput
          id={id}
          value={value}
          errors={errors}
          concreteDataPath={concreteDataPath}
          validationIssues={validationIssues}
          onChange={onChange}
        />
      ) : field.kind === "boolean" ? (
        <label
          className="flex min-h-11 items-center gap-3 border px-3 text-sm"
          htmlFor={id}
        >
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy || undefined}
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
                ? datePrecision === "date"
                  ? "date"
                  : "datetime-local"
                : "text"
          }
          value={
            field.kind === "date" && datePrecision !== undefined
              ? playgroundDateInputValue(
                  value,
                  datePrecision,
                  PLAYGROUND_RENDER_OPTIONS.timeZone
                )
              : typeof value === "string" || typeof value === "number"
                ? String(value)
                : ""
          }
          step={datePrecision === "second" ? 1 : undefined}
          required={field.required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === "date" ? (
        <p
          id={dateDescriptionId}
          className="mt-1.5 text-[10px] leading-4 text-muted-foreground"
        >
          {dateFormats.length > 0
            ? `Output ${dateFormats.join(" · ")}`
            : "Raw offset-bearing ISO value"}
          {` · ${PLAYGROUND_RENDER_OPTIONS.timeZone}`}
        </p>
      ) : null}
      {field.kind !== "image" && invalid ? (
        <FieldErrors id={errorId} errors={errors} />
      ) : null}
    </div>
  )
}

type FieldChangeHandler = (
  field: TemplateField,
  path: string,
  value: unknown
) => void

function ImageFieldInput({
  id,
  value,
  errors,
  concreteDataPath,
  validationIssues,
  onChange,
}: Readonly<{
  id: string
  value: unknown
  errors: readonly string[]
  concreteDataPath: string
  validationIssues: readonly TemplateDataIssue[]
  onChange: (value: unknown) => void
}>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const image = isPlaygroundImageValue(value) ? value : undefined
  const validationErrorId = `${id}-validation-error`
  const invalid = errors.length > 0
  const widthInvalid =
    fieldValidationMessages(validationIssues, `${concreteDataPath}.width`)
      .length > 0
  const heightInvalid =
    fieldValidationMessages(validationIssues, `${concreteDataPath}.height`)
      .length > 0
  const altTextInvalid =
    fieldValidationMessages(validationIssues, `${concreteDataPath}.altText`)
      .length > 0

  const chooseFile = async (file: File): Promise<void> => {
    setError(undefined)
    try {
      onChange(await readPlaygroundImage(file))
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The image could not be read."
      )
    }
  }

  const update = (key: keyof PlaygroundImageValue, next: unknown): void => {
    if (!image) return
    onChange({ ...image, [key]: next })
  }

  const updateNumber = (key: "width" | "height", next: string): void => {
    const parsed = parseFiniteNumberInput(next)
    if (parsed !== undefined) update(key, parsed)
  }

  return (
    <div className="border bg-muted/10 p-3">
      <Input
        ref={inputRef}
        id={id}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        aria-invalid={invalid || Boolean(error) || undefined}
        aria-describedby={
          error ? `${id}-error` : invalid ? validationErrorId : `${id}-hint`
        }
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void chooseFile(file)
          event.target.value = ""
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => inputRef.current?.click()}
        >
          <HugeiconsIcon icon={Upload02Icon} data-icon="inline-start" />
          {image ? "Replace image" : "Choose image"}
        </Button>
        {image ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(null)}
          >
            <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
            Clear image
          </Button>
        ) : null}
      </div>
      {image ? (
        <div className="mt-3 space-y-3">
          <p className="font-mono text-[10px] text-muted-foreground">
            {image.mimeType} · {image.pixelWidth} × {image.pixelHeight} px ·{" "}
            {formatBytes(image.bytes.length)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-width`} className="text-xs">
                Width (twips)
              </Label>
              <Input
                id={`${id}-width`}
                type="number"
                min={1}
                step={1}
                value={image.width}
                aria-invalid={widthInvalid || undefined}
                aria-describedby={widthInvalid ? validationErrorId : undefined}
                onChange={(event) => updateNumber("width", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-height`} className="text-xs">
                Height (twips)
              </Label>
              <Input
                id={`${id}-height`}
                type="number"
                min={1}
                step={1}
                value={image.height}
                aria-invalid={heightInvalid || undefined}
                aria-describedby={heightInvalid ? validationErrorId : undefined}
                onChange={(event) => updateNumber("height", event.target.value)}
              />
            </div>
          </div>
          <label
            className="flex min-h-11 items-center gap-3 border px-3 text-xs"
            htmlFor={`${id}-aspect`}
          >
            <input
              id={`${id}-aspect`}
              type="checkbox"
              checked={image.preserveAspectRatio}
              onChange={(event) =>
                update("preserveAspectRatio", event.target.checked)
              }
            />
            Preserve aspect ratio
          </label>
          <div>
            <Label htmlFor={`${id}-alt`} className="text-xs">
              Alternative text
            </Label>
            <Input
              id={`${id}-alt`}
              value={image.altText}
              aria-invalid={altTextInvalid || undefined}
              aria-describedby={altTextInvalid ? validationErrorId : undefined}
              onChange={(event) => update("altText", event.target.value)}
            />
          </div>
        </div>
      ) : (
        <p id={`${id}-hint`} className="mt-2 text-xs text-muted-foreground">
          Local PNG or JPEG only. The browser reads explicit bytes; URLs are
          never fetched.
        </p>
      )}
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {invalid ? <FieldErrors id={validationErrorId} errors={errors} /> : null}
    </div>
  )
}

function ArrayFieldEditor({
  field,
  fields,
  indexes,
  data,
  validationIssues,
  onFieldChange,
  onDataChange,
}: Readonly<{
  field: TemplateField
  fields: readonly TemplateField[]
  indexes: readonly number[]
  data: Readonly<Record<string, unknown>>
  validationIssues: readonly TemplateDataIssue[]
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
  const errors = path
    ? fieldValidationMessages(validationIssues, path)
    : ([] as const)
  const errorId = `${headingId}-validation-error`
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
    <fieldset
      className="min-w-0 border p-4"
      aria-labelledby={headingId}
      aria-invalid={errors.length > 0 || undefined}
      aria-describedby={errors.length > 0 ? errorId : undefined}
    >
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

      {errors.length > 0 ? <FieldErrors id={errorId} errors={errors} /> : null}

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
                        validationIssues={validationIssues}
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
                      validationIssues={validationIssues}
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

function FieldErrors({
  id,
  errors,
}: Readonly<{ id: string; errors: readonly string[] }>) {
  return (
    <div
      id={id}
      className="mt-2 space-y-1 text-xs text-destructive"
      role="alert"
    >
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
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

function starterValue(field: TemplateField): unknown {
  if (field.kind === "number") return 0
  if (field.kind === "boolean") return false
  if (field.kind === "image") return null
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

function schemaError(
  compiled: BrowserCompileResult,
  value: Readonly<Record<string, unknown>>
): string | undefined {
  const validation = validateTemplateData(compiled.jsonSchema, value)
  return validation.ok ? undefined : formatTemplateDataErrors(validation.errors)
}

function panelForKey(
  key: string,
  current: WorkspacePanel
): WorkspacePanel | undefined {
  const index = workspacePanels.findIndex((panel) => panel.id === current)
  if (key === "Home") return workspacePanels[0].id
  if (key === "End") return workspacePanels.at(-1)?.id
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined
  const direction = key === "ArrowRight" ? 1 : -1
  const nextIndex =
    (index + direction + workspacePanels.length) % workspacePanels.length
  return workspacePanels[nextIndex]?.id
}

function isPlaygroundImageValue(value: unknown): value is PlaygroundImageValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const candidate = value as Partial<PlaygroundImageValue>
  return (
    (candidate.mimeType === "image/png" ||
      candidate.mimeType === "image/jpeg") &&
    Array.isArray(candidate.bytes) &&
    typeof candidate.pixelWidth === "number" &&
    typeof candidate.pixelHeight === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.preserveAspectRatio === "boolean" &&
    typeof candidate.altText === "string"
  )
}
