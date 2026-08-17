import { useAuth } from "@clerk/tanstack-react-start"
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEffect, useRef } from "react"

import {
  AUTH_HANDSHAKE_TIMEOUT_MS,
  SIGN_IN_PATH,
  hasClerkHandshakeParams,
  sanitizeRedirect,
} from "@/lib/auth-redirect"
import { fetchAuthState } from "@/lib/auth-server"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (hasClerkHandshakeParams(location.searchStr)) {
      return
    }

    const { isAuthenticated } = await fetchAuthState()
    if (isAuthenticated) return

    throw redirect({
      replace: true,
      search: { redirect: sanitizeRedirect(location.pathname) },
      to: SIGN_IN_PATH,
    })
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const redirected = useRef(false)

  useEffect(() => {
    if (!isLoaded || isSignedIn || redirected.current) return

    const handshake = hasClerkHandshakeParams()
    if (!handshake) {
      redirected.current = true
      void navigate({
        replace: true,
        search: { redirect: sanitizeRedirect(location.pathname) },
        to: SIGN_IN_PATH,
      })
      return
    }

    const timeout = window.setTimeout(() => {
      if (redirected.current) return
      redirected.current = true
      void navigate({
        replace: true,
        search: { redirect: sanitizeRedirect(location.pathname) },
        to: SIGN_IN_PATH,
      })
    }, AUTH_HANDSHAKE_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [isLoaded, isSignedIn, location.pathname, navigate])

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <Spinner />
      </main>
    )
  }

  return <Outlet />
}
