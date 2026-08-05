import { createFileRoute } from "@tanstack/react-router"

import { DocsConfigurationRequired } from "@/components/docs-configuration-required"

export const Route = createFileRoute("/docs/")({
  component: DocsConfigurationRequired,
})
