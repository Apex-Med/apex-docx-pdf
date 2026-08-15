export const DEFAULT_AUTHENTICATED_REDIRECT = "/app" as const
export const SIGN_IN_PATH = "/sign-in" as const

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
    value.startsWith("/sign-up")
  ) {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  return value
}
