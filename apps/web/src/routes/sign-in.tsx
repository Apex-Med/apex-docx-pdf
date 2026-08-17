import { RedirectToTasks } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"

import { AuthFlow } from "@/components/auth-flow"
import { SiteHeader } from "@/components/site-header"
import { parseRedirectSearch, sanitizeRedirect } from "@/lib/auth-redirect"

export const Route = createFileRoute("/sign-in")({
  validateSearch: parseRedirectSearch,
  component: SignInPage,
  head: () => ({
    meta: [
      {
        title: "Log in — Apex DOCX PDF",
      },
      {
        name: "description",
        content: "Sign in or create an Apex DOCX PDF account.",
      },
    ],
  }),
})

function SignInPage() {
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <div className="min-h-svh overflow-x-clip">
      <RedirectToTasks />
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg items-center justify-center px-4 py-12 sm:min-h-[calc(100svh-4rem)] sm:px-5">
        <AuthFlow redirectTo={sanitizeRedirect(redirectTo)} />
      </main>
    </div>
  )
}
