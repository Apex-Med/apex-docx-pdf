export type ResourceLimits = Readonly<{
  maxTemplateBytes: number
  maxArchiveEntries: number
  maxDecompressedBytes: number
  maxXmlDepth: number
  maxXmlNodes: number
  maxXmlTextBytes: number
  maxImageCount: number
  maxImageBytes: number
  maxImageDimensionPixels: number
  /** Maximum width x height accepted for one raster image. */
  maxImagePixels: number
  maxDecodedImageBytes: number
  maxExpressionDepth: number
  maxObjectTraversalDepth: number
  maxJsonNodes: number
  maxJsonTextBytes: number
  maxJsonArrayItems: number
  maxLoopIterations: number
  maxExpandedNodes: number
  maxExpandedTextBytes: number
  maxPages: number
}>

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = Object.freeze({
  maxTemplateBytes: 20_000_000,
  maxArchiveEntries: 2_000,
  maxDecompressedBytes: 100_000_000,
  maxXmlDepth: 128,
  maxXmlNodes: 1_000_000,
  maxXmlTextBytes: 50_000_000,
  maxImageCount: 100,
  maxImageBytes: 20_000_000,
  maxImageDimensionPixels: 100_000,
  maxImagePixels: 100_000_000,
  maxDecodedImageBytes: 400_000_000,
  maxExpressionDepth: 32,
  maxObjectTraversalDepth: 32,
  maxJsonNodes: 100_000,
  maxJsonTextBytes: 10_000_000,
  maxJsonArrayItems: 100_000,
  maxLoopIterations: 10_000,
  maxExpandedNodes: 100_000,
  maxExpandedTextBytes: 10_000_000,
  maxPages: 500,
})

export type ResourceUsage = Readonly<{
  templateBytes: number
  archiveEntries: number
  decompressedBytes: number
  expandedNodes: number
  expandedTextBytes: number
  pages: number
}>

export function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}
