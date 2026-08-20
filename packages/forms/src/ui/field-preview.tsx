import { AutocompleteField } from "@workspace/ui/components/autocomplete"
import { Cascader } from "@workspace/ui/components/cascader"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DatePicker } from "@workspace/ui/components/date-picker"
import { FileUpload } from "@workspace/ui/components/file-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { NumberField } from "@workspace/ui/components/number-field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Textarea } from "@workspace/ui/components/textarea"
import type { ReactNode } from "react"

import {
  CONTEXT_BINDING_LABELS,
  DEFAULT_ATTACHMENT_ACCEPT,
  flattenChoiceOptions,
  hasDefaultAnswer,
  isLayoutBlock,
  isQuestion,
  isTodayDateDefault,
  type FormAnswerValue,
  type FormNode,
  type FormQuestion,
} from "../index"

export function FieldPreview({ node }: Readonly<{ node: FormNode }>): ReactNode {
  if (isLayoutBlock(node)) {
    if (node.kind === "heading") {
      return <h3 className="text-base font-medium">{node.label}</h3>
    }
    if (node.kind === "section") {
      return (
        <div className="border-t pt-3">
          <h3 className="text-sm font-medium">{node.label}</h3>
          {node.description ? (
            <p className="text-sm text-muted-foreground">{node.description}</p>
          ) : null}
        </div>
      )
    }
    if (node.kind === "text") {
      return (
        <p className="text-sm text-muted-foreground">
          {node.body?.trim() ? node.body : node.label}
        </p>
      )
    }
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground">
        {node.image?.alt || node.label}
      </div>
    )
  }
  if (!isQuestion(node) || node.kind === "repeater") return null
  return (
    <LabeledPreview
      label={node.label}
      description={node.description}
      required={node.required}
    >
      <QuestionPreview question={node} />
    </LabeledPreview>
  )
}

function QuestionPreview({
  question,
}: Readonly<{ question: FormQuestion }>): ReactNode {
  const defaultValue = hasDefaultAnswer(question)
    ? question.defaultValue
    : undefined
  switch (question.kind) {
    case "short_text":
      return (
        <Input
          disabled
          value={typeof defaultValue === "string" ? defaultValue : ""}
          placeholder="Your answer"
        />
      )
    case "long_text":
      return (
        <Textarea
          disabled
          value={typeof defaultValue === "string" ? defaultValue : ""}
          placeholder="Your answer"
        />
      )
    case "number":
      return (
        <NumberField
          disabled
          value={typeof defaultValue === "number" ? defaultValue : null}
          suffix={question.unit}
          onValueChange={() => undefined}
        />
      )
    case "date":
      if (isTodayDateDefault(defaultValue)) {
        return (
          <div className="flex h-8 w-full items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
            Today
          </div>
        )
      }
      return (
        <DatePicker
          value={typeof defaultValue === "string" ? defaultValue : ""}
          includeTime={question.includeTime === true}
          quickSelect={question.quickDateSelection === true}
          range={question.dateRange === true}
          disabled
          onValueChange={() => undefined}
        />
      )
    case "boolean":
      return (
        <RadioGroup
          disabled
          value={
            defaultValue === true ? "yes" : defaultValue === false ? "no" : ""
          }
          className="flex gap-4"
        >
          <div className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="yes" />
            Yes
          </div>
          <div className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="no" />
            No
          </div>
        </RadioGroup>
      )
    case "select":
      return (
        <div className="flex flex-col gap-2">
          <div className="flex h-8 w-full items-center justify-between rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
            {choiceDefaultLabel(question, defaultValue) ?? "Select…"}
          </div>
          {question.allowOther ? (
            <Input disabled placeholder="Please specify" aria-label="Other" />
          ) : null}
        </div>
      )
    case "autocomplete":
      return (
        <AutocompleteField
          disabled
          options={question.options ?? []}
          value={typeof defaultValue === "string" ? defaultValue : ""}
          allowCustomValue={question.allowOther === true}
          placeholder="Search…"
          onValueChange={() => undefined}
        />
      )
    case "cascader":
      return (
        <Cascader
          disabled
          options={question.options ?? []}
          value={typeof defaultValue === "string" ? defaultValue : ""}
          placeholder="Select…"
          onValueChange={() => undefined}
        />
      )
    case "multi_select": {
      const selected = Array.isArray(defaultValue)
        ? defaultValue.filter((item): item is string => typeof item === "string")
        : []
      return (
        <div className="flex flex-col gap-2">
          {(question.options ?? []).map((option) => (
            <div key={option.value} className="flex items-center gap-2 text-sm">
              <Checkbox disabled checked={selected.includes(option.value)} />
              {option.label}
            </div>
          ))}
          {question.allowOther ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox disabled />
              <span className="shrink-0">Other</span>
              <Input disabled placeholder="Please specify" aria-label="Other" />
            </div>
          ) : null}
        </div>
      )
    }
    case "reference":
      return (
        <div className="flex h-8 w-full items-center justify-between rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
          {typeof defaultValue === "string" && defaultValue.length > 0
            ? defaultValue
            : `Search ${question.reference?.source ?? "record"}…`}
        </div>
      )
    case "attachment": {
      const maxCount = question.attachment?.maxCount ?? 1
      return (
        <FileUpload
          disabled
          accept={(question.attachment?.accept ?? DEFAULT_ATTACHMENT_ACCEPT).join(",")}
          maxFiles={maxCount}
          maxSize={(question.attachment?.maxFileSizeMb ?? 10) * 1024 * 1024}
          multiple={maxCount > 1}
        />
      )
    }
    case "context": {
      const binding = question.context?.binding
      return (
        <Input
          disabled
          value={
            binding ? CONTEXT_BINDING_LABELS[binding] : "Context value"
          }
        />
      )
    }
    default:
      return null
  }
}

function choiceDefaultLabel(
  question: FormQuestion,
  value: FormAnswerValue | undefined
): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  const match = flattenChoiceOptions(question.options ?? []).find(
    (option) => option.value === value
  )
  return match?.label ?? value
}

function LabeledPreview({
  label,
  description,
  required,
  children,
}: Readonly<{
  label: string
  description?: string
  required?: boolean
  children: ReactNode
}>): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="pointer-events-none min-w-0">{children}</div>
    </div>
  )
}
