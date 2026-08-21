export const DEFAULT_AUTHENTICATED_REDIRECT = "/app" as const
export const SIGN_IN_PATH = "/sign-in" as const
export const AUTH_REDIRECT_STORAGE_KEY = "apex-auth-redirect"
export const AUTH_HANDSHAKE_TIMEOUT_MS = 20_000
export const AUTH_SETTLE_TIMEOUT_MS = 8_000
export const CHOOSE_ORGANIZATION_TASK_PATH =
  "/session-tasks/choose-organization" as const

const SESSION_TASK_PATHS = {
  "choose-organization": CHOOSE_ORGANIZATION_TASK_PATH,
} as const

export function sessionTaskPath(key: string) {
  if (key in SESSION_TASK_PATHS) {
    return SESSION_TASK_PATHS[key as keyof typeof SESSION_TASK_PATHS]
  }

  return `/session-tasks/${key}`
}

export function destinationForSession(
  session: { currentTask?: { key: string } | null } | null | undefined,
  fallback: string
) {
  const taskKey = session?.currentTask?.key
  return taskKey ? sessionTaskPath(taskKey) : fallback
}

export function parseRedirectSearch(search: Record<string, unknown>) {
  if (typeof search.redirect !== "string") {
    return {}
  }

  return { redirect: sanitizeRedirect(search.redirect) }
}

export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  if (
    value === SIGN_IN_PATH ||
    value.startsWith(`${SIGN_IN_PATH}/`) ||
    value.startsWith("/sign-up") ||
    value === "/sso-callback" ||
    value.startsWith("/sso-callback?")
  ) {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  return value
}

export function hasClerkHandshakeParams(search = "") {
  const value =
    search || (typeof window === "undefined" ? "" : window.location.search)
  return (
    value.includes("__clerk_handshake") ||
    value.includes("__clerk_db_jwt") ||
    value.includes("__clerk_synced")
  )
}

export function toSameOriginPath(url: string) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (!url.startsWith("/") || url.startsWith("//")) {
      return DEFAULT_AUTHENTICATED_REDIRECT
    }
    return url
  }

  try {
    const parsed = new URL(url)
    if (
      typeof window !== "undefined" &&
      parsed.origin === window.location.origin
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/"
    }
  } catch {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  return DEFAULT_AUTHENTICATED_REDIRECT
}

function getSessionStorage() {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function storeAuthRedirect(redirectTo: string) {
  getSessionStorage()?.setItem(
    AUTH_REDIRECT_STORAGE_KEY,
    sanitizeRedirect(redirectTo)
  )
}

export function readStoredRedirect() {
  return sanitizeRedirect(
    getSessionStorage()?.getItem(AUTH_REDIRECT_STORAGE_KEY)
  )
}

export function consumeStoredRedirect() {
  const storage = getSessionStorage()
  const redirectTo = sanitizeRedirect(
    storage?.getItem(AUTH_REDIRECT_STORAGE_KEY)
  )
  storage?.removeItem(AUTH_REDIRECT_STORAGE_KEY)
  return redirectTo
}

export function clerkNavigationTarget(to: string, origin: string) {
  try {
    const url = new URL(to, origin)
    const handshake =
      hasClerkHandshakeParams(url.search) || url.hash.includes("__clerk")
    if (url.origin !== origin || handshake) {
      return { href: url.href, mode: "assign" as const }
    }

    return {
      href: `${url.pathname}${url.search}${url.hash}` || "/",
      mode: "client" as const,
    }
  } catch {
    return { href: to, mode: "assign" as const }
  }
}

export function navigateAfterClerkUrl(
  to: string,
  clientNavigate: (href: string) => void
) {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  const target = clerkNavigationTarget(to, origin)
  if (target.mode === "assign") {
    window.location.assign(target.href)
    return
  }

  clientNavigate(target.href)
}
