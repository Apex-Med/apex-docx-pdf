import { TaskChooseOrganization } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"

import { DEFAULT_AUTHENTICATED_REDIRECT } from "@/lib/auth-redirect"

export const Route = createFileRoute("/session-tasks/choose-organization")({
  component: ChooseOrganizationPage,
  head: () => ({
    meta: [
      {
        title: "Choose a workspace — Apex DOCX PDF",
      },
    ],
  }),
})

function ChooseOrganizationPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <TaskChooseOrganization
        redirectUrlComplete={DEFAULT_AUTHENTICATED_REDIRECT}
      />
    </main>
  )
}
