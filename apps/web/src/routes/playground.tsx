import { createFileRoute } from "@tanstack/react-router"

import { PlaygroundWorkspace } from "@/components/playground-workspace"

export const Route = createFileRoute("/playground")({
  ssr: false,
  component: PlaygroundRoute,
})

function PlaygroundRoute() {
  return <PlaygroundWorkspace convexEnabled={false} />
}
