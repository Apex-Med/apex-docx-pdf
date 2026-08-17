import { useClerk } from "@clerk/tanstack-react-start"
import { useNavigate, createFileRoute } from "@tanstack/react-router"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEffect, useRef, useState } from "react"

import {
  AUTH_HANDSHAKE_TIMEOUT_MS,
  SIGN_IN_PATH,
  consumeStoredRedirect,
  navigateAfterClerkUrl,
  readStoredRedirect,
} from "@/lib/auth-redirect"

export const Route = createFileRoute("/sso-callback")({
  component: SsoCallbackPage,
  head: () => ({
    meta: [
      {
        title: "Continuing sign-in — Apex DOCX PDF",
      },
    ],
  }),
})

function SsoCallbackPage() {
  const clerk = useClerk()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (!clerk.loaded || hasRun.current) return
    hasRun.current = true

    const redirectTo = readStoredRedirect()
    void clerk
      .handleRedirectCallback(
        {
          continueSignUpUrl: SIGN_IN_PATH,
          firstFactorUrl: SIGN_IN_PATH,
          secondFactorUrl: SIGN_IN_PATH,
          signInFallbackRedirectUrl: redirectTo,
          signInUrl: SIGN_IN_PATH,
          signUpFallbackRedirectUrl: redirectTo,
          signUpUrl: SIGN_IN_PATH,
        },
        async (to) => {
          navigateAfterClerkUrl(to, (href) => {
            if (
              href === SIGN_IN_PATH ||
              href.startsWith(`${SIGN_IN_PATH}?`) ||
              href.startsWith("/session-tasks/")
            ) {
              void navigate({ href })
              return
            }
            consumeStoredRedirect()
            void navigate({ href })
          })
        }
      )
      .catch((callbackError: unknown) => {
        console.error(callbackError)
        setError(
          "Unable to finish signing in. Return to the sign-in page and try again."
        )
      })
  }, [clerk, navigate])

  useEffect(() => {
    if (!clerk.loaded || error) return

    const timeout = window.setTimeout(() => {
      setError(
        "Sign-in is taking too long. Return to the sign-in page and try again."
      )
    }, AUTH_HANDSHAKE_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [clerk.loaded, error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      {error ? (
        <>
          <p className="max-w-sm text-center text-sm text-destructive">
            {error}
          </p>
          <button
            className="text-sm underline-offset-4 hover:underline"
            onClick={() =>
              navigateAfterClerkUrl(SIGN_IN_PATH, (href) => {
                void navigate({ href })
              })
            }
            type="button"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <p className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Finishing sign-in…
        </p>
      )}
      <div id="clerk-captcha" />
    </main>
  )
}
