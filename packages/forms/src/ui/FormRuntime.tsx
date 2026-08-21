import { useForm } from "@tanstack/react-form"
import { AutocompleteField } from "@workspace/ui/components/autocomplete"
import { Button } from "@workspace/ui/components/button"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useEffect, useMemo, type ReactNode } from "react"

import {
  buildDefaultAnswers,
  commitOtherText,
  continueBulletList,
  DEFAULT_ATTACHMENT_ACCEPT,
  emptyRepeaterRow,
  isLayoutBlock,
  isNodeVisible,
  isOtherSelectedValue,
  isQuestion,
  joinMultiSelectValues,
  normalizeBulletMarkers,
  OTHER_OPTION_VALUE,
  otherTextFromSelectValue,
  selectValueForControl,
  splitMultiSelectValues,
  validateAnswers,
  type FormAnswers,
  type FormAnswerValue,
  type FormContextValues,
  type FormFileValue,
  type FormNode,
  type FormPage,
  type FormQuestion,
  type FormRepeaterRow,
  type FormTemplate,
  type ReferenceResolver,
} from "../index"

type FieldRenderApi = Readonly<{
  state: { value: unknown }
  handleChange: (value: unknown) => void
}>

type AnswersFormApi = Readonly<{
  Field: (props: {
    name: string
    children: (field: FieldRenderApi) => ReactNode
  }) => ReactNode
  Subscribe: (props: {
    selector: (state: { values: FormAnswers }) => FormAnswers
    children: (values: FormAnswers) => ReactNode
  }) => ReactNode
}>

export type FormRuntimeProps = Readonly<{
  form: FormTemplate
  answers?: FormAnswers
  context?: FormContextValues
  resolvers?: Readonly<Record<string, ReferenceResolver>>
  onAnswersChange?: (answers: FormAnswers) => void
  onSubmit?: (answers: FormAnswers) => void
  submitLabel?: string
  submitDisabled?: boolean
  readOnly?: boolean
}>

export function FormRuntime({
  form: template,
  answers,
  context,
  resolvers,
  onAnswersChange,
  onSubmit,
  submitLabel = "Submit",
  submitDisabled = false,
  readOnly = false,
}: FormRuntimeProps): ReactNode {
  const defaultValues = useMemo(
    () => ({ ...buildDefaultAnswers(template), ...(answers ?? {}) }),
    [template, answers]
  )
  const tanstack = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      onSubmit?.(value)
    },
    listeners: {
      onChange: ({ formApi }) => {
        onAnswersChange?.(formApi.state.values)
      },
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the form identity changes
  useEffect(() => {
    tanstack.reset(defaultValues)
  }, [template.id])

  return (
    <form
      className="apex-form-runtime flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void tanstack.handleSubmit()
      }}
    >
      {template.pages.map((page) => (
        <RuntimePage
          key={page.id}
          page={page}
          form={tanstack as unknown as AnswersFormApi}
          template={template}
          context={context}
          resolvers={resolvers}
          readOnly={readOnly}
        />
      ))}
      {onSubmit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly || submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function RuntimePage({
  page,
  form,
  template,
  context,
  resolvers,
  readOnly,
}: Readonly<{
  page: FormPage
  form: AnswersFormApi
  template: FormTemplate
  context?: FormContextValues
  resolvers?: Readonly<Record<string, ReferenceResolver>>
  readOnly: boolean
}>): ReactNode {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{page.title}</h2>
        {page.description ? (
          <p className="text-sm text-muted-foreground">{page.description}</p>
        ) : null}
      </header>
      <form.Subscribe selector={(state) => state.values}>
        {(values) =>
          page.nodes.map((node) => (
            <RuntimeNode
              key={node.id}
              node={node}
              form={form}
              values={values}
              template={template}
              context={context}
              resolvers={resolvers}
              readOnly={readOnly}
              path={node.key}
            />
          ))
        }
      </form.Subscribe>
    </section>
  )
}

function RuntimeNode({
  node,
  form,
  values,
  template,
  context,
  resolvers,
  readOnly,
  path,
}: Readonly<{
  node: FormNode
  form: AnswersFormApi
  values: FormAnswers
  template: FormTemplate
  context?: FormContextValues
  resolvers?: Readonly<Record<string, ReferenceResolver>>
  readOnly: boolean
  path: string
}>): ReactNode {
  if (!isNodeVisible(node, values)) return null
  if (isLayoutBlock(node)) {
    if (node.kind === "heading") {
      return <h3 className="text-sm font-medium">{node.label}</h3>
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
          {node.body ?? node.label}
        </p>
      )
    }
    return null
  }
  if (!isQuestion(node)) return null
  if (node.kind === "context") {
    const bound = node.context?.binding
    const value = bound ? (context?.[bound] ?? "") : ""
    return (
      <LabeledField
        label={node.label}
        description={node.description}
        required={node.required}
      >
        <Input value={value} readOnly disabled />
      </LabeledField>
    )
  }
  const errors = validateAnswers(template, values).errors
  const error = errors[path]
  return (
    <form.Field name={path}>
      {(field) => (
        <LabeledField
          label={node.label}
          description={node.description}
          required={node.required}
          error={error}
        >
          <QuestionControl
            question={node}
            value={field.state.value as FormAnswerValue | undefined}
            onChange={(next) => field.handleChange(next as never)}
            form={form}
            values={
              node.kind === "repeater" && Array.isArray(field.state.value)
                ? ({} as FormAnswers)
                : values
            }
            path={path}
            resolvers={resolvers}
            readOnly={readOnly}
          />
        </LabeledField>
      )}
    </form.Field>
  )
}

function QuestionControl({
  question,
  value,
  onChange,
  form,
  path,
  resolvers,
  readOnly,
}: Readonly<{
  question: FormQuestion
  value: FormAnswerValue | undefined
  onChange: (value: FormAnswerValue) => void
  form: AnswersFormApi
  values: FormAnswers
  path: string
  resolvers?: Readonly<Record<string, ReferenceResolver>>
  readOnly: boolean
}>): ReactNode {
  switch (question.kind) {
    case "short_text":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case "long_text":
      return (
        <LongTextField
          value={typeof value === "string" ? value : ""}
          disabled={readOnly}
          onChange={onChange}
        />
      )
    case "number":
      return (
        <NumberField
          value={typeof value === "number" ? value : null}
          disabled={readOnly}
          suffix={question.unit}
          onValueChange={(next) => onChange(next)}
        />
      )
    case "date":
      return (
        <DatePicker
          value={typeof value === "string" ? value : ""}
          includeTime={question.includeTime === true}
          quickSelect={question.quickDateSelection === true}
          range={question.dateRange === true}
          disabled={readOnly}
          onValueChange={onChange}
        />
      )
    case "boolean":
      return (
        <RadioGroup
          value={value === true ? "yes" : value === false ? "no" : ""}
          disabled={readOnly}
          onValueChange={(next) => onChange(next === "yes")}
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
    case "select": {
      const options = question.options ?? []
      const allowOther = question.allowOther === true
      const stringValue = typeof value === "string" ? value : ""
      const otherSelected = isOtherSelectedValue(
        stringValue,
        options,
        allowOther
      )
      const otherText = otherTextFromSelectValue(stringValue, options)
      return (
        <div className="flex flex-col gap-2">
          <Select
            value={
              selectValueForControl(stringValue, options, allowOther) || null
            }
            items={[
              ...options.map((option) => ({
                value: option.value,
                label: option.label,
              })),
              ...(allowOther
                ? [{ value: OTHER_OPTION_VALUE, label: "Other" }]
                : []),
            ]}
            disabled={readOnly}
            onValueChange={(next) => {
              if (typeof next !== "string") return
              if (next === OTHER_OPTION_VALUE) {
                onChange(otherText.length > 0 ? otherText : OTHER_OPTION_VALUE)
                return
              }
              onChange(next)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {allowOther ? (
                  <SelectItem value={OTHER_OPTION_VALUE}>Other</SelectItem>
                ) : null}
              </SelectGroup>
            </SelectContent>
          </Select>
          {allowOther && otherSelected ? (
            <OtherSpecifyInput
              value={otherText}
              disabled={readOnly}
              onChange={(next) => onChange(commitOtherText(next))}
            />
          ) : null}
        </div>
      )
    }
    case "autocomplete":
      return (
        <AutocompleteField
          value={typeof value === "string" ? value : ""}
          options={question.options ?? []}
          disabled={readOnly}
          allowCustomValue={question.allowOther === true}
          placeholder="Search…"
          onValueChange={onChange}
        />
      )
    case "cascader":
      return (
        <Cascader
          value={typeof value === "string" ? value : ""}
          options={question.options ?? []}
          disabled={readOnly}
          placeholder="Select…"
          onValueChange={onChange}
        />
      )
    case "multi_select": {
      const selected = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : []
      const { known, otherSelected, otherText } = splitMultiSelectValues(
        selected,
        question.options
      )
      return (
        <div className="flex flex-col gap-2">
          {(question.options ?? []).map((option) => {
            const checked = known.includes(option.value)
            return (
              <div
                key={option.value}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  disabled={readOnly}
                  onCheckedChange={(next) => {
                    const on = next === true
                    const nextKnown = on
                      ? [...known, option.value]
                      : known.filter((item) => item !== option.value)
                    onChange(
                      joinMultiSelectValues(nextKnown, otherSelected, otherText)
                    )
                  }}
                />
                {option.label}
              </div>
            )
          })}
          {question.allowOther ? (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={otherSelected}
                disabled={readOnly}
                onCheckedChange={(next) => {
                  const on = next === true
                  onChange(
                    joinMultiSelectValues(known, on, on ? otherText : "")
                  )
                }}
              />
              <span className="shrink-0">Other</span>
              <OtherSpecifyInput
                value={otherText}
                disabled={readOnly}
                onChange={(next) =>
                  onChange(
                    joinMultiSelectValues(
                      known,
                      next.length > 0 || otherSelected,
                      next
                    )
                  )
                }
              />
            </div>
          ) : null}
        </div>
      )
    }
    case "reference":
      return (
        <ReferenceField
          question={question}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          resolver={
            question.reference?.source
              ? resolvers?.[question.reference.source]
              : undefined
          }
          readOnly={readOnly}
        />
      )
    case "attachment": {
      const maxCount = question.attachment?.maxCount ?? 1
      const maxFileSizeMb = question.attachment?.maxFileSizeMb ?? 10
      return (
        <FileUpload
          disabled={readOnly}
          accept={(
            question.attachment?.accept ?? DEFAULT_ATTACHMENT_ACCEPT
          ).join(",")}
          maxFiles={maxCount}
          maxSize={maxFileSizeMb * 1024 * 1024}
          multiple={maxCount > 1}
          onFilesChange={(files) => {
            const mapped: FormFileValue[] = files.map((fileItem) => ({
              id: fileItem.id,
              name: fileItem.file.name,
              mimeType: fileItem.file.type,
              sizeBytes: fileItem.file.size,
            }))
            onChange(mapped)
          }}
        />
      )
    }
    case "repeater": {
      const rows = Array.isArray(value) ? (value as FormRepeaterRow[]) : []
      return (
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: repeater rows are ordered answer slots
              key={`${path}-${index}`}
              className="flex flex-col gap-3 rounded-lg border p-3"
            >
              {(question.children ?? []).map((child) => {
                if (!isQuestion(child) || isLayoutBlock(child)) return null
                const childPath = `${path}[${index}].${child.key}`
                return (
                  <form.Field key={child.id} name={childPath}>
                    {(childField) => (
                      <LabeledField
                        label={child.label}
                        required={child.required}
                      >
                        <QuestionControl
                          question={child}
                          value={childField.state.value as FormAnswerValue}
                          onChange={(next) =>
                            childField.handleChange(next as never)
                          }
                          form={form}
                          values={row as FormAnswers}
                          path={childPath}
                          resolvers={resolvers}
                          readOnly={readOnly}
                        />
                      </LabeledField>
                    )}
                  </form.Field>
                )
              })}
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
                  }
                >
                  Remove row
                </Button>
              )}
            </div>
          ))}
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...rows, emptyRepeaterRow(question)])}
            >
              Add row
            </Button>
          )}
        </div>
      )
    }
    default:
      return null
  }
}

function OtherSpecifyInput({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}>): ReactNode {
  return (
    <Input
      value={value}
      disabled={disabled}
      placeholder="Please specify"
      aria-label="Other"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function LongTextField({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}>): ReactNode {
  return (
    <Textarea
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(normalizeBulletMarkers(event.target.value))}
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.nativeEvent.isComposing
        ) {
          return
        }
        const target = event.currentTarget
        const next = continueBulletList(
          target.value,
          target.selectionStart,
          target.selectionEnd
        )
        if (!next) return
        event.preventDefault()
        onChange(next.value)
        requestAnimationFrame(() => {
          target.selectionStart = next.selectionStart
          target.selectionEnd = next.selectionEnd
        })
      }}
    />
  )
}

function ReferenceField({
  question,
  value,
  onChange,
  resolver,
  readOnly,
}: Readonly<{
  question: FormQuestion
  value: string
  onChange: (value: string) => void
  resolver?: ReferenceResolver
  readOnly: boolean
}>): ReactNode {
  const options = (question.reference?.allowedIds ?? []).map((id) => ({
    value: id,
    label: id,
  }))
  if (!resolver) {
    return (
      <AutocompleteField
        value={value}
        options={options}
        disabled={readOnly}
        onValueChange={onChange}
        placeholder="Search…"
      />
    )
  }
  return (
    <Input
      value={value}
      disabled={readOnly}
      placeholder="Reference id"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function LabeledField({
  label,
  description,
  required,
  error,
  children,
}: Readonly<{
  label: string
  description?: string
  required?: boolean
  error?: string
  children: ReactNode
}>): ReactNode {
  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={Boolean(error) || undefined}
    >
      <Label>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
