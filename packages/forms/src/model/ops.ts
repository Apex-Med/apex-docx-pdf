import {
  coerceDefaultFromSource,
  questionWithNormalizedDefault,
} from "./defaults"
import { DEFAULT_ATTACHMENT_ACCEPT } from "./attachment"
import { createFormId, slugifyKey, uniqueKey } from "./ids"
import { flattenChoiceOptions } from "./options"
import {
  CONTEXT_BINDINGS,
  isChoiceKind,
  isLayoutBlock,
  isLayoutKind,
  isQuestion,
  type ContextBinding,
  type FormChoiceKind,
  type FormLayoutBlock,
  type FormNode,
  type FormNodeKind,
  type FormOption,
  type FormPage,
  type FormQuestion,
  type FormQuestionKind,
  type FormTemplate,
  type FormValidation,
} from "./types"
import {
  collectKeys,
  collectPageKeys,
  findNode,
  insertNodeInList,
  removeNodeFromList,
  updateNodeList,
} from "./walk"

export function createEmptyForm(name = "Untitled form"): FormTemplate {
  const page = createPage(
    "Page 1",
    collectPageKeys({ id: "tmp", name, pages: [] })
  )
  return {
    id: createFormId("form"),
    name,
    pages: [page],
  }
}

export function createPage(
  title: string,
  takenKeys: Iterable<string> = []
): FormPage {
  return {
    id: createFormId("page"),
    key: uniqueKey(slugifyKey(title), takenKeys),
    title,
    nodes: [],
  }
}

export function defaultNodeForKind(
  kind: FormNodeKind,
  label: string,
  takenKeys: Iterable<string>
): FormNode {
  const key = uniqueKey(slugifyKey(label), takenKeys)
  const id = createFormId("node")
  if (isLayoutKind(kind)) {
    const block: FormLayoutBlock = {
      id,
      key,
      label,
      kind,
      ...(kind === "text" ? { body: "" } : {}),
      ...(kind === "image" ? { image: { alt: label } } : {}),
    }
    return block
  }
  const question: FormQuestion = {
    id,
    key,
    label,
    kind,
    required: false,
    ...(kind === "select" || kind === "multi_select" || kind === "autocomplete"
      ? { options: defaultFlatOptions() }
      : {}),
    ...(kind === "cascader" ? { options: defaultCascaderOptions() } : {}),
    ...(kind === "repeater" ? { columns: 2, children: [] } : {}),
    ...(kind === "reference"
      ? {
          reference: {
            source: "patient",
            fields: defaultReferenceFields("patient"),
          },
        }
      : {}),
    ...(kind === "attachment"
      ? {
          attachment: {
            accept: [...DEFAULT_ATTACHMENT_ACCEPT],
            maxFileSizeMb: 10,
            maxCount: 1,
          },
        }
      : {}),
    ...(kind === "context"
      ? { context: { binding: "patient" }, locked: true, required: true }
      : {}),
    ...(kind === "date" ? { includeTime: false } : {}),
  }
  return question
}

export function nodeWithKind(node: FormNode, kind: FormNodeKind): FormNode {
  if (node.kind === kind) return node
  const identity = {
    id: node.id,
    key: node.key,
    label: node.label,
    ...(node.description !== undefined
      ? { description: node.description }
      : {}),
    ...(node.condition !== undefined ? { condition: node.condition } : {}),
  }
  if (isLayoutKind(kind)) {
    const fromLayout = isLayoutBlock(node) ? node : null
    const fromQuestion = isQuestion(node) ? node : null
    const block: FormLayoutBlock = {
      ...identity,
      kind,
      ...(kind === "text"
        ? { body: fromLayout?.body ?? fromQuestion?.description ?? "" }
        : {}),
      ...(kind === "image"
        ? { image: fromLayout?.image ?? { alt: node.label } }
        : {}),
    }
    return block
  }
  const source = isQuestion(node) ? node : null
  const fromLayout = isLayoutBlock(node) ? node : null
  const defaultValue = coerceDefaultFromSource(kind, source)
  const question: FormQuestion = {
    ...identity,
    kind,
    required: kind === "context" ? true : (source?.required ?? false),
    ...(kind === "context"
      ? {
          locked: true,
          context: source?.context ?? { binding: "patient" as const },
        }
      : {}),
    ...(kind === "date"
      ? {
          includeTime: source?.includeTime === true,
          ...(source?.quickDateSelection === true
            ? { quickDateSelection: true }
            : {}),
          ...(source?.dateRange === true ? { dateRange: true } : {}),
        }
      : {}),
    ...(isChoiceKind(kind) ? choiceFields(kind, source) : {}),
    ...(kind === "number" ? numberFields(source) : {}),
    ...(kind === "reference"
      ? {
          reference: source?.reference ?? {
            source: "patient",
            fields: defaultReferenceFields("patient"),
          },
        }
      : {}),
    ...(kind === "attachment"
      ? {
          attachment: source?.attachment ?? {
            accept: [...DEFAULT_ATTACHMENT_ACCEPT],
            maxFileSizeMb: 10,
            maxCount: 1,
          },
        }
      : {}),
    ...(kind === "repeater"
      ? {
          columns: source?.columns ?? 2,
          children: source?.children ?? [],
        }
      : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  }
  if (
    question.description === undefined &&
    fromLayout?.kind === "text" &&
    fromLayout.body
  ) {
    return questionWithNormalizedDefault({
      ...question,
      description: fromLayout.body,
    })
  }
  return questionWithNormalizedDefault(question)
}

function defaultFlatOptions(): FormOption[] {
  return [{ value: "option_1", label: "Option 1" }]
}

function defaultCascaderOptions(): FormOption[] {
  return [
    {
      value: "group_1",
      label: "Group 1",
      children: [{ value: "group_1/option_1", label: "Option 1" }],
    },
  ]
}

function choiceFields(
  kind: FormChoiceKind,
  source: FormQuestion | null
): Pick<FormQuestion, "options" | "allowOther"> {
  const raw = source?.options
  const options =
    raw && raw.length > 0
      ? kind === "cascader"
        ? raw
        : flattenChoiceOptions(raw)
      : kind === "cascader"
        ? defaultCascaderOptions()
        : defaultFlatOptions()
  return {
    options,
    ...(kind !== "cascader" && source?.allowOther === true
      ? { allowOther: true }
      : {}),
  }
}

function numberFields(
  source: FormQuestion | null
): Pick<FormQuestion, "validation" | "unit"> {
  const min = source?.validation?.min
  const max = source?.validation?.max
  const validation: FormValidation = {
    ...(typeof min === "number" ? { min } : {}),
    ...(typeof max === "number" ? { max } : {}),
  }
  return {
    ...(Object.keys(validation).length > 0 ? { validation } : {}),
    ...(source?.unit ? { unit: source.unit } : {}),
  }
}

export function defaultReferenceFields(
  source: string
): readonly { key: string; label: string }[] {
  if (source === "clinician" || source === "current_user") {
    return [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name" },
      { key: "full_name", label: "Full name" },
      { key: "initials", label: "Initials" },
      { key: "hpcsa_number", label: "HPCSA number" },
      { key: "qualifications", label: "Qualifications" },
    ]
  }
  if (source === "patient") {
    return [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name" },
      { key: "full_name", label: "Full name" },
    ]
  }
  if (source === "ward") return [{ key: "name", label: "Name" }]
  if (source === "facility") {
    return [
      { key: "name", label: "Name" },
      { key: "address", label: "Address" },
      { key: "phone", label: "Phone" },
    ]
  }
  if (source === "department") return [{ key: "name", label: "Name" }]
  return [{ key: "label", label: "Label" }]
}

export function addPage(
  form: FormTemplate,
  title = `Page ${form.pages.length + 1}`
): FormTemplate {
  const page = createPage(title, collectPageKeys(form))
  return { ...form, pages: [...form.pages, page] }
}

export function removePage(form: FormTemplate, pageId: string): FormTemplate {
  if (form.pages.length <= 1) return form
  return { ...form, pages: form.pages.filter((page) => page.id !== pageId) }
}

export function movePage(
  form: FormTemplate,
  pageId: string,
  toIndex: number
): FormTemplate {
  const from = form.pages.findIndex((page) => page.id === pageId)
  if (from < 0) return form
  const pages = [...form.pages]
  const [page] = pages.splice(from, 1)
  if (!page) return form
  pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, page)
  return { ...form, pages }
}

export function updatePage(
  form: FormTemplate,
  pageId: string,
  patch: Partial<Pick<FormPage, "title" | "description" | "key">>
): FormTemplate {
  return {
    ...form,
    pages: form.pages.map((page) => {
      if (page.id !== pageId) return page
      const title = patch.title ?? page.title
      const key =
        patch.key !== undefined
          ? uniqueKey(
              patch.key,
              collectPageKeys(form).filter((entry) => entry !== page.key)
            )
          : page.key
      return { ...page, ...patch, title, key }
    }),
  }
}

export function addNode(
  form: FormTemplate,
  pageId: string,
  kind: FormNodeKind,
  options: Readonly<{
    label?: string
    index?: number
    parentId?: string | null
  }> = {}
): FormTemplate {
  const label = options.label ?? defaultLabelForKind(kind)
  const node = defaultNodeForKind(kind, label, collectKeys(form))
  return insertExistingNode(form, pageId, node, {
    index: options.index,
    parentId: options.parentId ?? null,
  })
}

export function insertExistingNode(
  form: FormTemplate,
  pageId: string,
  node: FormNode,
  options: Readonly<{ index?: number; parentId?: string | null }> = {}
): FormTemplate {
  return {
    ...form,
    pages: form.pages.map((page) => {
      if (page.id !== pageId) return page
      const parentId = options.parentId ?? null
      const siblings =
        parentId === null
          ? page.nodes
          : ((findNode(form, parentId)?.node as FormQuestion | undefined)
              ?.children ?? [])
      const index = options.index ?? siblings.length
      return {
        ...page,
        nodes: insertNodeInList(page.nodes, parentId, index, node),
      }
    }),
  }
}

export function removeNode(form: FormTemplate, nodeId: string): FormTemplate {
  return {
    ...form,
    pages: form.pages.map((page) => ({
      ...page,
      nodes: removeNodeFromList(page.nodes, nodeId),
    })),
  }
}

export function moveNode(
  form: FormTemplate,
  nodeId: string,
  target: Readonly<{
    pageId: string
    index: number
    parentId?: string | null
  }>
): FormTemplate {
  const located = findNode(form, nodeId)
  if (!located) return form
  const stripped = removeNode(form, nodeId)
  return insertExistingNode(stripped, target.pageId, located.node, {
    index: target.index,
    parentId: target.parentId ?? null,
  })
}

export function duplicateNode(
  form: FormTemplate,
  nodeId: string
): FormTemplate {
  const located = findNode(form, nodeId)
  if (!located) return form
  const clone = cloneNodeWithNewIds(located.node, collectKeys(form))
  return insertExistingNode(form, located.location.pageId, clone, {
    index: located.location.index + 1,
    parentId: located.location.parentId,
  })
}

export type FormNodePatch = Partial<Omit<FormQuestion, "id" | "kind">> &
  Partial<Omit<FormLayoutBlock, "id" | "kind">> & {
    kind?: FormNodeKind
  }

export function updateNode(
  form: FormTemplate,
  nodeId: string,
  patch: FormNodePatch
): FormTemplate {
  return {
    ...form,
    pages: form.pages.map((page) => ({
      ...page,
      nodes: updateNodeList(page.nodes, nodeId, (node) => {
        const nextKey =
          patch.key !== undefined && patch.key !== node.key
            ? uniqueKey(
                patch.key,
                collectKeys(form).filter((key) => key !== node.key)
              )
            : node.key
        const { kind, key: _key, ...rest } = patch
        const converted =
          kind !== undefined && kind !== node.kind
            ? nodeWithKind(node, kind)
            : node
        const merged = {
          ...converted,
          ...rest,
          id: node.id,
          key: nextKey,
        } as FormNode
        return isQuestion(merged)
          ? questionWithNormalizedDefault(merged)
          : merged
      }),
    })),
  }
}

export function renameForm(form: FormTemplate, name: string): FormTemplate {
  return { ...form, name }
}

export function isContextBinding(value: string): value is ContextBinding {
  return (CONTEXT_BINDINGS as readonly string[]).includes(value)
}

function defaultLabelForKind(kind: FormNodeKind): string {
  switch (kind) {
    case "short_text":
      return "Short text"
    case "long_text":
      return "Long text"
    case "number":
      return "Number"
    case "date":
      return "Date"
    case "boolean":
      return "Yes / No"
    case "select":
      return "Select"
    case "multi_select":
      return "Multi-select"
    case "autocomplete":
      return "Autocomplete"
    case "cascader":
      return "Cascader"
    case "reference":
      return "Reference"
    case "attachment":
      return "Attachment"
    case "repeater":
      return "Repeater"
    case "context":
      return "Patient"
    case "section":
      return "Section"
    case "heading":
      return "Heading"
    case "text":
      return "Text"
    case "image":
      return "Image"
  }
}

function cloneNodeWithNewIds(
  node: FormNode,
  taken: Iterable<string>
): FormNode {
  const used = new Set(taken)
  const cloneOne = (entry: FormNode): FormNode => {
    const key = uniqueKey(entry.key, used)
    used.add(key)
    if (isQuestion(entry) && entry.kind === "repeater") {
      return {
        ...entry,
        id: createFormId("node"),
        key,
        label: `${entry.label} copy`,
        children: (entry.children ?? []).map(cloneOne),
      }
    }
    return {
      ...entry,
      id: createFormId("node"),
      key,
      label: `${entry.label} copy`,
    }
  }
  return cloneOne(node)
}

export type { FormQuestionKind }
