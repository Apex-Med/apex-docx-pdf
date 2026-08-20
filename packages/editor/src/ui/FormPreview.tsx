import {
  flattenQuestions,
  type FormAnswers,
  type FormTemplate,
} from "@apexmed/forms"
import { FormRuntime } from "@apexmed/forms/ui"
import { Button } from "@workspace/ui/components/button"
import { PDFViewer } from "@workspace/ui/components/pdf-viewer"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEffect, useRef, useState, type ReactNode } from "react"

export type FormPreviewProps = Readonly<{
  form: FormTemplate
  answers: FormAnswers
  onAnswersChange: (answers: FormAnswers) => void
  onGeneratePdf: (answers: FormAnswers) => Promise<Uint8Array>
  onOpenFormBuilder: () => void
}>

type PreviewStep = "form" | "pdf"

export function FormPreview({
  form,
  answers,
  onAnswersChange,
  onGeneratePdf,
  onOpenFormBuilder,
}: FormPreviewProps): ReactNode {
  const answersRef = useRef(answers)
  answersRef.current = answers
  const generatingRef = useRef(false)
  const [step, setStep] = useState<PreviewStep>("form")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  const replacePdfUrl = (next: string | null) => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    pdfUrlRef.current = next
    setPdfUrl(next)
  }

  const generate = async (nextAnswers: FormAnswers) => {
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setError(null)
    try {
      const bytes = await onGeneratePdf(nextAnswers)
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
      replacePdfUrl(URL.createObjectURL(blob))
      setStep("pdf")
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to generate PDF"
      )
      setStep("form")
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  const hasQuestions = flattenQuestions(form).length > 0
  const title = form.name.trim() || "Form preview"

  if (!hasQuestions) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PreviewHeader title={title} step="form" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            This document has no form questions yet. Build the form, then
            preview it here and generate a PDF from test answers.
          </p>
          <Button type="button" variant="outline" onClick={onOpenFormBuilder}>
            Open form builder
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewHeader
        title={title}
        step={step}
        onBack={() => setStep("form")}
        actions={
          step === "form" ? (
            <Button
              type="button"
              disabled={generating}
              onClick={() => void generate(answersRef.current)}
            >
              {generating ? (
                <>
                  <Spinner />
                  Generating…
                </>
              ) : (
                "Generate PDF"
              )}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setStep("form")}>
              Back to form
            </Button>
          )
        }
      />
      {error && step === "form" ? (
        <p className="border-b px-4 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      {step === "form" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-xl flex-col">
            <FormRuntime
              form={form}
              answers={answers}
              onAnswersChange={(next) => {
                answersRef.current = next
                onAnswersChange(next)
              }}
              onSubmit={(next) => void generate(next)}
              submitLabel={generating ? "Generating…" : "Generate PDF"}
              submitDisabled={generating}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30">
          {pdfUrl ? (
            <PDFViewer
              key={pdfUrl}
              src={pdfUrl}
              fileName="document.pdf"
              className="min-h-0 flex-1 overflow-hidden bg-background"
              showUpload={false}
              showDownload
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Unable to preview the generated PDF.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PreviewHeader({
  title,
  step,
  onBack,
  actions,
}: Readonly<{
  title: string
  step: PreviewStep
  onBack?: () => void
  actions?: ReactNode
}>): ReactNode {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-medium">{title}</h2>
        <nav aria-label="Preview steps" className="flex items-center gap-2 text-xs">
          <StepLabel current={step === "form"} onClick={step === "pdf" ? onBack : undefined}>
            1. Fill form
          </StepLabel>
          <span className="text-muted-foreground" aria-hidden="true">
            →
          </span>
          <StepLabel current={step === "pdf"}>2. PDF</StepLabel>
        </nav>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

function StepLabel({
  current,
  onClick,
  children,
}: Readonly<{
  current: boolean
  onClick?: () => void
  children: ReactNode
}>): ReactNode {
  const className = current
    ? "font-medium text-foreground"
    : "text-muted-foreground"
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {children}
      </button>
    )
  }
  return current ? (
    <span className={className} aria-current="step">
      {children}
    </span>
  ) : (
    <span className={className}>{children}</span>
  )
}
