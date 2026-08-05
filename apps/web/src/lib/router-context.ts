import type { QueryClient } from "@tanstack/react-query"

export type RouterContext = Readonly<{
  queryClient: QueryClient
  convexEnabled: boolean
}>
