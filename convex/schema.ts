import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const diagnosticsSummary = v.object({
  errorCount: v.number(),
  warningCount: v.number(),
  infoCount: v.number(),
  codes: v.array(v.string()),
})

export default defineSchema({
  templates: defineTable({
    sessionId: v.string(),
    name: v.string(),
    originalFileStorageId: v.optional(v.id("_storage")),
    sourceHash: v.string(),
    engineVersion: v.string(),
    manifestJson: v.string(),
    jsonSchemaJson: v.string(),
    starterDataJson: v.string(),
    status: v.union(
      v.literal("ready"),
      v.literal("invalid"),
      v.literal("deleting")
    ),
    diagnosticsSummary,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId_and_updatedAt", ["sessionId", "updatedAt"])
    .index("by_sessionId_and_sourceHash", ["sessionId", "sourceHash"]),

  renders: defineTable({
    sessionId: v.string(),
    templateId: v.id("templates"),
    templateHash: v.string(),
    fontRegistryHash: v.string(),
    dataHash: v.string(),
    optionsHash: v.string(),
    cacheKey: v.string(),
    pdfStorageId: v.optional(v.id("_storage")),
    pageCount: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("rendering"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("deleting")
    ),
    diagnosticsSummary,
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_sessionId_and_templateId_and_createdAt", [
      "sessionId",
      "templateId",
      "createdAt",
    ])
    .index("by_sessionId_and_cacheKey", ["sessionId", "cacheKey"])
    .index("by_sessionId_and_cacheKey_and_status", [
      "sessionId",
      "cacheKey",
      "status",
    ])
    .index("by_sessionId_and_createdAt", ["sessionId", "createdAt"]),
})
