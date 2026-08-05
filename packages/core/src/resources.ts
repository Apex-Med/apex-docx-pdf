export type ResourceLimits = Readonly<{
  maxTemplateBytes: number
  maxArchiveEntries: number
  maxDecompressedBytes: number
  maxXmlDepth: number
  maxExpressionDepth: number
  maxObjectTraversalDepth: number
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
  maxExpressionDepth: 32,
  maxObjectTraversalDepth: 32,
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
