export const GITHUB_URL =
  "https://github.com/craig-bredenkamp/apex-docx-pdf" as const

export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues` as const
export const GITHUB_NEW_ISSUE_URL = `${GITHUB_ISSUES_URL}/new/choose` as const

const configuredDocsUrl = import.meta.env.VITE_DOCS_URL?.trim()

export const DOCS_URL = (
  configuredDocsUrl || (import.meta.env.DEV ? "http://localhost:3001" : "/docs")
).replace(/\/$/, "")

export const EXTERNAL_DOCS_CONFIGURED = /^https?:\/\//u.test(DOCS_URL)

export function docsPath(path = ""): string {
  if (!path) return DOCS_URL
  return `${DOCS_URL}/${path.replace(/^\//, "")}`
}
