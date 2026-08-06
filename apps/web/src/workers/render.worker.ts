import { installRendererWorker } from "@apexmed/browser/worker"

import { loadOfflineFontConfiguration } from "@/lib/font-assets"

const fontFaces = loadOfflineFontConfiguration().then((fonts) => ({ fonts }))

installRendererWorker(undefined, fontFaces)
