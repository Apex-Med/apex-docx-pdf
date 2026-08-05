import { createFileRoute } from "@tanstack/react-router"

import { PlaygroundWorkspace } from "@/components/playground-workspace"

export const Route = createFileRoute("/playground")({ component: PlaygroundRoute })

function PlaygroundRoute() {
  return <PlaygroundWorkspace />
}
