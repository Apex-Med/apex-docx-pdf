import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { SessionProvider } from "convex-helpers/react/sessions"
import { ConvexProvider } from "convex/react"

import type { RouterContext } from "@/lib/router-context"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  const convexQueryClient = convexUrl
    ? new ConvexQueryClient(convexUrl)
    : undefined
  const queryClient = new QueryClient({
    defaultOptions: convexQueryClient
      ? {
          queries: {
            queryKeyHashFn: convexQueryClient.hashFn(),
            queryFn: convexQueryClient.queryFn(),
          },
        }
      : undefined,
  })

  convexQueryClient?.connect(queryClient)

  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
      convexEnabled: convexQueryClient !== undefined,
    } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) =>
      convexQueryClient ? (
        <ConvexProvider client={convexQueryClient.convexClient}>
          <SessionProvider ssrFriendly>{children}</SessionProvider>
        </ConvexProvider>
      ) : (
        children
      ),
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
