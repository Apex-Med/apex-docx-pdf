import {
  Cancel02Icon,
  CheckmarkCircle02Icon,
  CopyIcon,
  Download02Icon,
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
import type { TemplateField } from "@apex-docx-pdf/core"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"

import { SiteHeader } from "@/components/site-header"
import { SAMPLE_DATA, createSampleDocx } from "@/lib/sample-docx"

type Activity = Readonly<{
  state: "idle" | "working" | "complete" | "error"
  label: string
  progress?: WorkerProgress
}>

const idleActivity: Activity = { state: "idle", label: "Waiting for a template" }

export function PlaygroundWorkspace() {
  const clientRef = useRef<BrowserRendererClient | undefined>(undefined)
  const urlLeaseRef = useRef<ObjectUrlLease | undefined>(undefined)
  const operationRef = useRef<AbortController | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [fileName, setFileName] = useState<string>()
  const [fileSize, setFileSize] = useState<number>()
  const [compiled, setCompiled] = useState<BrowserCompileResult>()
  const [data, setData] = useState<Readonly<Record<string, unknown>>>(SAMPLE_DATA)
  const [jsonText, setJsonText] = useState(() => JSON.stringify(SAMPLE_DATA, null, 2))
  const [jsonError, setJsonError] = useState<string>()
  const [rendered, setRendered] = useState<BrowserRenderResult>()
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [activity, setActivity] = useState<Activity>(idleActivity)
  const [diagnostics, setDiagnostics] = useState<BrowserCompileResult["diagnostics"]>([])

  useEffect(() => {
    const worker = new Worker(new URL("../workers/render.worker.ts", import.meta.url), {
      type: "module",
    })
    const client = new BrowserRendererClient(worker)
    const lease = new ObjectUrlLease()
    clientRef.current = client
    urlLeaseRef.current = lease
    setReady(true)
    return () => {
      operationRef.current?.abort()
      client.dispose()
      lease.revoke()
      clientRef.current = undefined
      urlLeaseRef.current = undefined
    }
  }, [])

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
          {
            locale: "en-ZA",
            timeZone: "Africa/Johannesburg",
            metadata: { title: "Apex DOCX PDF playground document" },
            includeLayoutTrace: true,
          },
          {
            signal: controller.signal,
            onProgress: (progress) =>
              setActivity({ state: "working", label: progress.message, progress }),
          }
        )
        const url = urlLeaseRef.current?.replace(result.pdf.slice().buffer, "application/pdf")
        setRendered(result)
        setPdfUrl(url)
        setDiagnostics(result.diagnostics)
        setActivity({ state: "complete", label: `Rendered ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}` })
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
      urlLeaseRef.current?.revoke()
      setDiagnostics([])
      setActivity({ state: "working", label: "Validating DOCX package" })
      try {
        const result = await client.compile(bytes, {
          signal: controller.signal,
          onProgress: (progress) =>
            setActivity({ state: "working", label: progress.message, progress }),
        })
        const starterData = name === "apex-sample.docx" ? SAMPLE_DATA : result.starterData
        setCompiled(result)
        setData(starterData)
        setJsonText(JSON.stringify(starterData, null, 2))
        setJsonError(undefined)
        setDiagnostics(result.diagnostics)
        setActivity({ state: "complete", label: `Found ${result.manifest.fields.length} field${result.manifest.fields.length === 1 ? "" : "s"}` })
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
      if (!file.name.toLowerCase().endsWith(".docx")) {
        setActivity({ state: "error", label: "Choose a .docx template" })
        return
      }
      if (file.size > 20_000_000) {
        setActivity({ state: "error", label: "Template exceeds the 20 MB demo limit" })
        return
      }
      await compileBytes(new Uint8Array(await file.arrayBuffer()), file.name)
    },
    [compileBytes]
  )

  const onJsonChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.target.value
    setJsonText(next)
    try {
      const parsed: unknown = JSON.parse(next)
      if (!isRecord(parsed)) throw new TypeError("Root data must be a JSON object")
      setData(parsed)
      setJsonError(undefined)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON")
    }
  }

  const updateField = (field: TemplateField, value: string | boolean): void => {
    const parsedValue =
      field.kind === "number"
        ? value === ""
          ? 0
          : Number(value)
        : value
    const next = setPath(data, field.path, parsedValue)
    setData(next)
    setJsonText(JSON.stringify(next, null, 2))
    setJsonError(undefined)
  }

  const cancel = (): void => {
    operationRef.current?.abort()
    setActivity({ state: "idle", label: "Operation cancelled" })
  }

  return (
    <div className="min-h-svh bg-muted/20">
      <SiteHeader compact />
      <main>
        <div className="flex flex-col gap-5 border-b bg-background px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Document playground</h1>
              <Badge variant="secondary">Phase 1 profile</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Compile and render locally in a Web Worker. Your document is not uploaded.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Status activity={activity} />
            {activity.state === "working" ? (
              <Button variant="outline" size="sm" onClick={cancel}>
                <HugeiconsIcon icon={Cancel02Icon} data-icon="inline-start" />
                Cancel
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!compiled || Boolean(jsonError) || activity.state === "working"}
              onClick={() => compiled && void runRender(compiled.templateHash, data)}
            >
              <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
              Render PDF
            </Button>
          </div>
        </div>

        <div className="grid min-h-[calc(100svh-8.75rem)] xl:grid-cols-[minmax(280px,0.82fr)_minmax(340px,1fr)_minmax(440px,1.28fr)]">
          <TemplatePanel
            ready={ready}
            fileName={fileName}
            fileSize={fileSize}
            compiled={compiled}
            diagnostics={diagnostics}
            onFile={onFile}
            onSample={() => void compileBytes(createSampleDocx(), "apex-sample.docx")}
          />
          <DataPanel
            compiled={compiled}
            data={data}
            jsonText={jsonText}
            jsonError={jsonError}
            onJsonChange={onJsonChange}
            onFieldChange={updateField}
            onReset={() => {
              const next = compiled?.starterData ?? SAMPLE_DATA
              setData(next)
              setJsonText(JSON.stringify(next, null, 2))
              setJsonError(undefined)
            }}
          />
          <ResultPanel rendered={rendered} pdfUrl={pdfUrl} activity={activity} />
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
}>

function TemplatePanel({ ready, fileName, fileSize, compiled, diagnostics, onFile, onSample }: TemplatePanelProps) {
  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault()
    const file = event.dataTransfer.files.item(0)
    if (file !== null) void onFile(file)
  }

  return (
    <section className="min-w-0 border-b bg-background xl:border-r xl:border-b-0" aria-labelledby="template-panel-title">
      <PanelHeader index="01" title="Template" description="Upload and inspect the supported DOCX profile." />
      <div className="p-5">
        <label
          htmlFor="template-upload"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="group flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed border-border bg-muted/20 px-5 text-center transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-within:border-ring"
        >
          <span className="grid size-10 place-items-center bg-foreground text-background">
            <HugeiconsIcon icon={Upload02Icon} strokeWidth={1.8} />
          </span>
          <span className="mt-4 text-sm font-medium">Drop a .docx or choose a file</span>
          <span className="mt-1 text-xs text-muted-foreground">Validated locally · 20 MB limit</span>
          <Input
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
        </label>
        <Button className="mt-3 w-full" variant="outline" disabled={!ready} onClick={onSample}>
          <HugeiconsIcon icon={File02Icon} data-icon="inline-start" />
          Use sample template
        </Button>

        {fileName ? (
          <div className="mt-5 border p-4">
            <p className="truncate text-sm font-medium" title={fileName}>{fileName}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              <span>{formatBytes(fileSize ?? 0)}</span>
              <span>{compiled ? `${compiled.templateHash.slice(0, 12)}…` : "hashing…"}</span>
            </div>
          </div>
        ) : null}

        <Tabs defaultValue="preview" className="mt-6">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="pt-5">
            <TemplatePreview compiled={compiled} />
          </TabsContent>
          <TabsContent value="fields" className="pt-5">
            <FieldList fields={compiled?.manifest.fields ?? []} />
          </TabsContent>
          <TabsContent value="schema" className="pt-5">
            <CodeBlock value={compiled ? JSON.stringify(compiled.jsonSchema, null, 2) : "Compile a template to generate JSON Schema."} />
          </TabsContent>
          <TabsContent value="diagnostics" className="pt-5">
            <DiagnosticList diagnostics={diagnostics} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

type DataPanelProps = Readonly<{
  compiled?: BrowserCompileResult
  data: Readonly<Record<string, unknown>>
  jsonText: string
  jsonError?: string
  onJsonChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onFieldChange: (field: TemplateField, value: string | boolean) => void
  onReset: () => void
}>

function DataPanel({ compiled, data, jsonText, jsonError, onJsonChange, onFieldChange, onReset }: DataPanelProps) {
  return (
    <section className="min-w-0 border-b bg-background xl:border-r xl:border-b-0" aria-labelledby="data-panel-title">
      <PanelHeader index="02" title="Data" description="Edit generated fields or work directly in JSON." />
      <div className="p-5">
        <Tabs defaultValue="form">
          <div className="flex items-center justify-between gap-3">
            <TabsList variant="line">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="xs" onClick={onReset}>
              <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" />
              Reset
            </Button>
          </div>
          <TabsContent value="form" className="pt-6">
            {compiled?.manifest.fields.length ? (
              <div className="space-y-5">
                {compiled.manifest.fields.map((field) => (
                  <FieldInput key={field.path} field={field} value={getPath(data, field.path)} onChange={(value) => onFieldChange(field, value)} />
                ))}
              </div>
            ) : (
              <EmptyState title="No generated fields yet" description="Compile a DOCX template and its placeholders will appear here." />
            )}
          </TabsContent>
          <TabsContent value="json" className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="template-json">Template data</Label>
              <Button variant="ghost" size="icon-xs" aria-label="Copy JSON" onClick={() => void navigator.clipboard.writeText(jsonText)}>
                <HugeiconsIcon icon={CopyIcon} />
              </Button>
            </div>
            <Textarea
              id="template-json"
              className="mt-3 min-h-[430px] resize-y font-mono text-xs leading-6"
              spellCheck={false}
              value={jsonText}
              aria-invalid={Boolean(jsonError)}
              aria-describedby={jsonError ? "json-error" : undefined}
              onChange={onJsonChange}
            />
            {jsonError ? <p id="json-error" className="mt-2 text-xs text-destructive">{jsonError}</p> : <p className="mt-2 text-xs text-muted-foreground">Valid JSON object · fields are resolved strictly</p>}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

function ResultPanel({ rendered, pdfUrl, activity }: Readonly<{ rendered?: BrowserRenderResult; pdfUrl?: string; activity: Activity }>) {
  return (
    <section className="min-w-0 bg-muted/20" aria-labelledby="result-panel-title">
      <PanelHeader index="03" title="Result" description="The PDF uses the engine’s measured display list." />
      <div className="p-5">
        {rendered && pdfUrl ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{rendered.pageCount} page{rendered.pageCount === 1 ? "" : "s"}</Badge>
                <Badge variant="secondary">{rendered.timings.totalMs.toFixed(1)} ms</Badge>
                <Badge variant="secondary">{formatBytes(rendered.pdf.byteLength)}</Badge>
              </div>
              <a className="inline-flex h-9 items-center gap-2 bg-foreground px-4 text-xs font-semibold tracking-widest text-background uppercase" href={pdfUrl} download="apex-render.pdf">
                <HugeiconsIcon className="size-3.5" icon={Download02Icon} />
                Download
              </a>
            </div>
            <iframe className="h-[720px] w-full bg-white shadow-xl ring-1 ring-foreground/10" src={pdfUrl} title="Generated PDF preview" />
          </>
        ) : activity.state === "working" ? (
          <div className="grid min-h-[620px] place-items-center border bg-background">
            <div className="max-w-xs text-center">
              <span className="mx-auto block size-3 animate-pulse bg-brand motion-reduce:animate-none" />
              <p className="mt-5 text-sm font-medium">{activity.label}</p>
              <p className="mt-2 text-xs text-muted-foreground">Work stays inside the browser worker.</p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[620px] place-items-center border border-dashed bg-background/60">
            <EmptyState title="Your PDF will appear here" description="Use the sample template or upload a supported DOCX to render the first page." />
          </div>
        )}
      </div>
    </section>
  )
}

function PanelHeader({ index, title, description }: Readonly<{ index: string; title: string; description: string }>) {
  return (
    <div className="border-b bg-background px-5 py-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] tracking-widest text-brand">{index}</span>
        <h2 id={`${title.toLowerCase()}-panel-title`} className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-1 pl-8 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

function Status({ activity }: Readonly<{ activity: Activity }>) {
  return (
    <div className="flex min-h-9 items-center gap-2 border px-3 text-xs" role="status" aria-live="polite">
      <span className={activity.state === "working" ? "size-2 animate-pulse bg-brand motion-reduce:animate-none" : activity.state === "error" ? "size-2 bg-destructive" : activity.state === "complete" ? "size-2 bg-emerald-500" : "size-2 bg-muted-foreground/40"} />
      <span className="max-w-64 truncate">{activity.label}</span>
      {activity.progress ? <span className="text-muted-foreground">{activity.progress.completed}/{activity.progress.total}</span> : null}
    </div>
  )
}

function TemplatePreview({ compiled }: Readonly<{ compiled?: BrowserCompileResult }>) {
  if (!compiled) return <EmptyState title="No template loaded" description="The engine preview and recognised tags will appear after compilation." />
  return (
    <div className="mx-auto aspect-[1/1.414] w-full max-w-[260px] bg-white p-7 text-neutral-900 shadow-lg ring-1 ring-black/10">
      <p className="text-sm font-semibold">Template inspection</p>
      <div className="mt-6 space-y-4">
        {compiled.manifest.fields.map((field) => (
          <div key={field.path}>
            <div className="h-1.5 w-3/5 bg-neutral-200" />
            <p className="mt-1.5 bg-blue-50 px-1 py-1 font-mono text-[8px] text-blue-700">{`{{${field.path}${field.kind === "string" ? "" : `:${field.kind}`}}}`}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function FieldList({ fields }: Readonly<{ fields: readonly TemplateField[] }>) {
  if (!fields.length) return <EmptyState title="No fields discovered" description="Upload or open the sample template to inspect placeholders." />
  return (
    <div className="divide-y border">
      {fields.map((field) => (
        <div key={field.path} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0"><p className="truncate font-mono text-xs">{field.path}</p><p className="mt-1 text-[10px] text-muted-foreground">{field.sourceLocations[0]?.part}</p></div>
          <Badge variant="secondary">{field.kind}</Badge>
        </div>
      ))}
    </div>
  )
}

function FieldInput({ field, value, onChange }: Readonly<{ field: TemplateField; value: unknown; onChange: (value: string | boolean) => void }>) {
  const id = `field-${field.path.replaceAll(".", "-")}`
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label htmlFor={id}>{field.path}</Label>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">{field.kind}</span>
      </div>
      {field.kind === "boolean" ? (
        <label className="flex min-h-11 items-center gap-3 border px-3 text-sm" htmlFor={id}>
          <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          {value === true ? "True" : "False"}
        </label>
      ) : (
        <Input id={id} type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"} value={typeof value === "string" || typeof value === "number" ? String(value).slice(0, field.kind === "date" ? 10 : undefined) : ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

function DiagnosticList({ diagnostics }: Readonly<{ diagnostics: BrowserCompileResult["diagnostics"] }>) {
  if (!diagnostics.length) {
    return <div className="flex items-center gap-3 border p-4 text-sm"><HugeiconsIcon className="size-4 text-emerald-600" icon={CheckmarkCircle02Icon} /><span>No diagnostics for the current operation.</span></div>
  }
  return <div className="space-y-2">{diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${index}`} className="border p-3"><div className="flex items-center justify-between gap-3"><code className="font-mono text-[10px]">{diagnostic.code}</code><Badge variant={diagnostic.severity === "error" ? "destructive" : "secondary"}>{diagnostic.severity}</Badge></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{diagnostic.message}</p></div>)}</div>
}

function CodeBlock({ value }: Readonly<{ value: string }>) {
  return <pre className="max-h-[470px] overflow-auto border bg-muted/30 p-4 font-mono text-[10px] leading-5"><code>{value}</code></pre>
}

function EmptyState({ title, description }: Readonly<{ title: string; description: string }>) {
  return <div className="mx-auto max-w-xs py-12 text-center"><p className="text-sm font-medium">{title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></div>
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
  setActivity({ state: "error", label: error instanceof Error ? error.message : "The operation failed" })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getPath(data: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = data
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function setPath(data: Readonly<Record<string, unknown>>, path: string, value: unknown): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = structuredClone(data)
  const segments = path.split(".")
  let current = result
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value
      break
    }
    if (!isRecord(current[segment])) current[segment] = {}
    current = current[segment] as Record<string, unknown>
  }
  return result
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
