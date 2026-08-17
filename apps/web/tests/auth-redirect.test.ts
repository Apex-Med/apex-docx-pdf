import { afterEach, describe, expect, test } from "bun:test"

import {
  AUTH_REDIRECT_STORAGE_KEY,
  CHOOSE_ORGANIZATION_TASK_PATH,
  DEFAULT_AUTHENTICATED_REDIRECT,
  clerkNavigationTarget,
  consumeStoredRedirect,
  destinationForSession,
  hasClerkHandshakeParams,
  parseRedirectSearch,
  readStoredRedirect,
  sanitizeRedirect,
  sessionTaskPath,
  storeAuthRedirect,
  toSameOriginPath,
} from "../src/lib/auth-redirect"

const originalWindow = globalThis.window

function withWindow(options: {
  origin?: string
  search?: string
  storage?: Record<string, string>
}) {
  const storage = options.storage ?? {}
  const sessionStorage = {
    getItem(key: string) {
      return storage[key] ?? null
    },
    setItem(key: string, value: string) {
      storage[key] = value
    },
    removeItem(key: string) {
      delete storage[key]
    },
    clear() {
      for (const key of Object.keys(storage)) {
        delete storage[key]
      }
    },
    key() {
      return null
    },
    get length() {
      return Object.keys(storage).length
    },
  } satisfies Pick<
    Storage,
    "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length"
  >

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: options.origin ?? "https://pdf-docx.apexmed.dev",
        search: options.search ?? "",
      },
      sessionStorage,
    },
  })

  return storage
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  })
})

describe("sanitizeRedirect", () => {
  test("keeps in-app destinations", () => {
    expect(sanitizeRedirect("/app")).toBe("/app")
    expect(sanitizeRedirect("/editor")).toBe("/editor")
    expect(sanitizeRedirect("/editor?mode=print")).toBe("/editor?mode=print")
  })

  test("rejects open redirects and auth loops", () => {
    expect(sanitizeRedirect("//evil.example")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(sanitizeRedirect("https://evil.example")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(sanitizeRedirect("/sign-in")).toBe(DEFAULT_AUTHENTICATED_REDIRECT)
    expect(sanitizeRedirect("/sign-in/continue")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(sanitizeRedirect("/sign-up")).toBe(DEFAULT_AUTHENTICATED_REDIRECT)
    expect(sanitizeRedirect("/sso-callback")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(sanitizeRedirect("/sso-callback?code=1")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(sanitizeRedirect(undefined)).toBe(DEFAULT_AUTHENTICATED_REDIRECT)
  })
})

describe("parseRedirectSearch", () => {
  test("sanitizes redirect search values during route validation", () => {
    expect(parseRedirectSearch({ redirect: "/editor" })).toEqual({
      redirect: "/editor",
    })
    expect(parseRedirectSearch({ redirect: "//evil.example" })).toEqual({
      redirect: DEFAULT_AUTHENTICATED_REDIRECT,
    })
    expect(parseRedirectSearch({})).toEqual({})
  })
})

describe("hasClerkHandshakeParams", () => {
  test("detects Clerk handshake query parameters", () => {
    expect(hasClerkHandshakeParams("?__clerk_handshake=abc")).toBe(true)
    expect(hasClerkHandshakeParams("?foo=1&__clerk_db_jwt=token")).toBe(true)
    expect(hasClerkHandshakeParams("?__clerk_synced=true")).toBe(true)
    expect(hasClerkHandshakeParams("?redirect=/app")).toBe(false)
  })

  test("falls back to the current window search string", () => {
    withWindow({ search: "?__clerk_handshake=1" })
    expect(hasClerkHandshakeParams()).toBe(true)
  })
})

describe("toSameOriginPath", () => {
  test("keeps same-origin paths and rejects protocol-relative or external URLs", () => {
    withWindow({ origin: "https://pdf-docx.apexmed.dev" })

    expect(toSameOriginPath("/editor")).toBe("/editor")
    expect(toSameOriginPath("/sign-in?redirect=%2Fapp")).toBe(
      "/sign-in?redirect=%2Fapp"
    )
    expect(toSameOriginPath("//evil.example")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(toSameOriginPath("https://evil.example/phish")).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(
      toSameOriginPath("https://pdf-docx.apexmed.dev/editor?mode=print#top")
    ).toBe("/editor?mode=print#top")
  })
})

describe("session tasks", () => {
  test("maps known Clerk task keys to hosted paths", () => {
    expect(sessionTaskPath("choose-organization")).toBe(
      CHOOSE_ORGANIZATION_TASK_PATH
    )
    expect(sessionTaskPath("reset-password")).toBe(
      "/session-tasks/reset-password"
    )
    expect(
      destinationForSession(
        { currentTask: { key: "choose-organization" } },
        "/app"
      )
    ).toBe(CHOOSE_ORGANIZATION_TASK_PATH)
    expect(destinationForSession({ currentTask: null }, "/editor")).toBe(
      "/editor"
    )
  })
})

describe("clerkNavigationTarget", () => {
  test("uses a document load for handshake and cross-origin URLs", () => {
    const origin = "http://localhost:3002"
    expect(clerkNavigationTarget("http://localhost:3002/app", origin)).toEqual({
      href: "/app",
      mode: "client",
    })
    expect(
      clerkNavigationTarget(
        "http://localhost:3002/app?__clerk_db_jwt=token",
        origin
      )
    ).toEqual({
      href: "http://localhost:3002/app?__clerk_db_jwt=token",
      mode: "assign",
    })
    expect(
      clerkNavigationTarget(
        "https://rested-lynx-13.accounts.dev/v1/client/handshake?redirect_url=http://localhost:3002/app",
        origin
      )
    ).toEqual({
      href: "https://rested-lynx-13.accounts.dev/v1/client/handshake?redirect_url=http://localhost:3002/app",
      mode: "assign",
    })
  })
})

describe("stored auth redirects", () => {
  test("stores a sanitized value and consumes it once", () => {
    const storage = withWindow({})

    storeAuthRedirect("//evil.example")
    expect(storage[AUTH_REDIRECT_STORAGE_KEY]).toBe(
      DEFAULT_AUTHENTICATED_REDIRECT
    )
    expect(readStoredRedirect()).toBe(DEFAULT_AUTHENTICATED_REDIRECT)

    storeAuthRedirect("/editor")
    expect(consumeStoredRedirect()).toBe("/editor")
    expect(storage[AUTH_REDIRECT_STORAGE_KEY]).toBeUndefined()
    expect(consumeStoredRedirect()).toBe(DEFAULT_AUTHENTICATED_REDIRECT)
  })
})
