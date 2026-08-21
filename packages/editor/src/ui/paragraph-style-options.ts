import type { StyleDefinition } from "@apexmed/core"

const BUILT_IN_PARAGRAPH_STYLES = Object.freeze([
  { id: "Normal", name: "Normal" },
  { id: "Heading1", name: "Heading 1" },
  { id: "Heading2", name: "Heading 2" },
  { id: "Title", name: "Title" },
])

/** Keep the built-in typography choices visible alongside imported styles. */
export function paragraphStyleOptions(
  definitions: readonly StyleDefinition[]
): readonly { id: string; name: string }[] {
  const options = new Map(
    BUILT_IN_PARAGRAPH_STYLES.map((style) => [style.id, style])
  )
  for (const definition of definitions) {
    if (definition.type !== "paragraph") continue
    options.set(definition.id, {
      id: definition.id,
      name: definition.name,
    })
  }
  return [...options.values()]
}
