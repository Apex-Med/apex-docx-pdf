import {
  FORM_ANSWERS_META_KEY,
  FORM_TEMPLATE_META_KEY,
  type FormAnswers,
  type FormTemplate,
} from "./types"
import { createEmptyForm } from "./ops"

export function readFormTemplate(
  metadata: Readonly<Record<string, unknown>> | null | undefined
): FormTemplate | null {
  if (!metadata || typeof metadata !== "object") return null
  const raw = metadata[FORM_TEMPLATE_META_KEY]
  if (!raw || typeof raw !== "object") return null
  const record = raw as FormTemplate
  if (typeof record.id !== "string" || !Array.isArray(record.pages)) return null
  return record
}

export function readFormAnswers(
  metadata: Readonly<Record<string, unknown>> | null | undefined
): FormAnswers {
  if (!metadata || typeof metadata !== "object") return {}
  const raw = metadata[FORM_ANSWERS_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as FormAnswers
}

export function writeFormMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  form: FormTemplate,
  answers: FormAnswers
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [FORM_TEMPLATE_META_KEY]: form,
    [FORM_ANSWERS_META_KEY]: answers,
  }
}

export function formFromMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined
): FormTemplate {
  return readFormTemplate(metadata) ?? createEmptyForm()
}
