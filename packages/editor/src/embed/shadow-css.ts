/**
 * Tailwind v4 shadow-DOM CSS transform.
 *
 * - Hoist @property rules to the document (they do not work in shadow roots)
 * - Rewrite :root → :host
 * - Materialize --tw-* initial values on :host
 * - Reset inheritable typography on :host so host page CSS cannot move page breaks
 */

export type ShadowCssTransformResult = Readonly<{
  /** CSS safe to inject into the shadow root. */
  shadowCss: string
  /** @property rules that must be appended to document head. */
  hoistedPropertyRules: string
}>

const PROPERTY_BLOCK =
  /@property\s+[^{]+\{[^}]*\}/gsu

/**
 * Transform a Tailwind-produced stylesheet for shadow DOM hosting.
 */
export function transformCssForShadowDom(css: string): ShadowCssTransformResult {
  const properties: string[] = []
  let body = css.replace(PROPERTY_BLOCK, (match) => {
    properties.push(match)
    return ""
  })

  // :root → :host
  body = body.replace(/(^|[,}\s]):root\b/gu, "$1:host")

  // Materialize common --tw-* defaults if present as @property initials
  const twVars: string[] = []
  for (const rule of properties) {
    const nameMatch = rule.match(/@property\s+(--[\w-]+)/u)
    const initialMatch = rule.match(/initial-value:\s*([^;]+);/u)
    if (nameMatch && initialMatch) {
      twVars.push(`${nameMatch[1]}: ${initialMatch[1]?.trim()};`)
    }
  }

  const hostReset = `
:host {
  all: initial;
  display: block;
  font-family: Calibri, Inter, system-ui, sans-serif;
  font-size: 11pt;
  line-height: normal;
  color: var(--apex-page-fg, #000000);
  -webkit-font-smoothing: antialiased;
  ${twVars.join("\n  ")}
}
:host *, :host *::before, :host *::after {
  box-sizing: border-box;
}
`

  return {
    shadowCss: `${hostReset}\n${body}`,
    hoistedPropertyRules: properties.join("\n"),
  }
}

/** Append hoisted @property rules once to document.head. */
export function hoistPropertyRulesToDocument(rules: string): void {
  if (!rules.trim()) return
  if (typeof document === "undefined") return
  const existing = document.getElementById("apex-editor-tw-properties")
  if (existing) return
  const style = document.createElement("style")
  style.id = "apex-editor-tw-properties"
  style.textContent = rules
  document.head.appendChild(style)
}
