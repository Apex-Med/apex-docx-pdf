import { createFileRoute } from "@tanstack/react-router"

import { DocsConfigurationRequired } from "@/routes/docs"

export const Route = createFileRoute("/docs/$")({
  component: DocsConfigurationRequired,
})
