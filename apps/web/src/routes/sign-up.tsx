import { createFileRoute, redirect } from "@tanstack/react-router"

import { parseRedirectSearch } from "@/lib/auth-redirect"

export const Route = createFileRoute("/sign-up")({
  validateSearch: parseRedirectSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/sign-in",
      search: search.redirect ? { redirect: search.redirect } : {},
    })
  },
})
