import {
  isLayoutBlock,
  isQuestion,
  type FormNode,
  type FormPage,
  type FormQuestion,
  type FormTemplate,
} from "./types"

export type NodeLocation = Readonly<{
  pageId: string
  parentId: string | null
  index: number
  path: readonly string[]
}>

export type LocatedNode = Readonly<{
  node: FormNode
  location: NodeLocation
}>

export function walkNodes(
  form: FormTemplate,
  visit: (entry: LocatedNode) => void
): void {
  for (const page of form.pages) {
    walkList(page.nodes, page.id, null, [], visit)
  }
}

function walkList(
  nodes: readonly FormNode[],
  pageId: string,
  parentId: string | null,
  path: readonly string[],
  visit: (entry: LocatedNode) => void
): void {
  nodes.forEach((node, index) => {
    const location: NodeLocation = { pageId, parentId, index, path }
    visit({ node, location })
    if (isQuestion(node) && node.kind === "repeater" && node.children) {
      walkList(node.children, pageId, node.id, [...path, node.key], visit)
    }
  })
}

export function findNode(
  form: FormTemplate,
  nodeId: string
): LocatedNode | null {
  let found: LocatedNode | null = null
  walkNodes(form, (entry) => {
    if (found) return
    if (entry.node.id === nodeId) found = entry
  })
  return found
}

export function findPage(
  form: FormTemplate,
  pageId: string
): FormPage | null {
  return form.pages.find((page) => page.id === pageId) ?? null
}

export function collectKeys(form: FormTemplate): string[] {
  const keys: string[] = []
  walkNodes(form, ({ node }) => {
    keys.push(node.key)
  })
  return keys
}

export function collectPageKeys(form: FormTemplate): string[] {
  return form.pages.map((page) => page.key)
}

export function flattenQuestions(form: FormTemplate): FormQuestion[] {
  const questions: FormQuestion[] = []
  walkNodes(form, ({ node }) => {
    if (isQuestion(node)) questions.push(node)
  })
  return questions
}

export function flattenInputQuestions(form: FormTemplate): FormQuestion[] {
  return flattenQuestions(form).filter(
    (question) => !isLayoutBlock(question) && question.kind !== "repeater"
  )
}

export function mapNodes(
  nodes: readonly FormNode[],
  mapper: (node: FormNode) => FormNode
): FormNode[] {
  return nodes.map((node) => {
    const next = mapper(node)
    if (isQuestion(next) && next.kind === "repeater" && next.children) {
      return { ...next, children: mapNodes(next.children, mapper) }
    }
    return next
  })
}

export function updateNodeList(
  nodes: readonly FormNode[],
  nodeId: string,
  updater: (node: FormNode) => FormNode
): FormNode[] {
  return nodes.flatMap((node) => {
    if (node.id === nodeId) {
      const next = updater(node)
      if (
        isQuestion(node) &&
        node.kind === "repeater" &&
        next.kind !== "repeater"
      ) {
        return [next, ...(node.children ?? [])]
      }
      return [next]
    }
    if (isQuestion(node) && node.kind === "repeater" && node.children) {
      return [
        {
          ...node,
          children: updateNodeList(node.children, nodeId, updater),
        },
      ]
    }
    return [node]
  })
}

export function removeNodeFromList(
  nodes: readonly FormNode[],
  nodeId: string
): FormNode[] {
  const filtered = nodes.filter((node) => node.id !== nodeId)
  return filtered.map((node) => {
    if (isQuestion(node) && node.kind === "repeater" && node.children) {
      return {
        ...node,
        children: removeNodeFromList(node.children, nodeId),
      }
    }
    return node
  })
}

export function insertNodeInList(
  nodes: readonly FormNode[],
  parentId: string | null,
  index: number,
  incoming: FormNode
): FormNode[] {
  if (parentId === null) {
    const next = [...nodes]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, incoming)
    return next
  }
  return nodes.map((node) => {
    if (node.id === parentId && isQuestion(node) && node.kind === "repeater") {
      const children = [...(node.children ?? [])]
      children.splice(
        Math.max(0, Math.min(index, children.length)),
        0,
        incoming
      )
      return { ...node, children }
    }
    if (isQuestion(node) && node.kind === "repeater" && node.children) {
      return {
        ...node,
        children: insertNodeInList(node.children, parentId, index, incoming),
      }
    }
    return node
  })
}
