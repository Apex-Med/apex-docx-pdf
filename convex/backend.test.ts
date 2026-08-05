import { describe, expect, test } from "bun:test"
import { convexTest } from "convex-test"
import type { SessionId } from "convex-helpers/server/sessions"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./renders.ts": () => import("./renders"),
  "./storage.ts": () => import("./storage"),
  "./templates.ts": () => import("./templates"),
}

const sessionA = "00000000-0000-4000-8000-000000000001" as SessionId
const sessionB = "00000000-0000-4000-8000-000000000002" as SessionId
const sourceHash = "a".repeat(64)
const fontRegistryHash = "b".repeat(64)
const dataHash = "c".repeat(64)
const optionsHash = "d".repeat(64)
const cacheKey = "e".repeat(64)
const diagnosticsSummary = {
  errorCount: 0,
  warningCount: 1,
  infoCount: 0,
  codes: ["layout/font-fallback"],
}

function createTemplateArgs() {
  return {
    sessionId: sessionA,
    name: "invoice.docx",
    sourceHash,
    engineVersion: "0.0.0-phase.7",
    manifestJson: '{"fields":[]}',
    jsonSchemaJson: '{"type":"object"}',
    starterDataJson: "{}",
    status: "ready" as const,
    diagnosticsSummary,
  }
}

async function registeredUpload(
  t: ReturnType<typeof convexTest>,
  kind: "docx" | "pdf",
  bytes: string
) {
  return await t.run(async (ctx) => {
    const contentType =
      kind === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf"
    const now = Date.now()
    const uploadIntentId = await ctx.db.insert("uploadIntents", {
      sessionId: sessionA,
      kind,
      status: "awaitingUpload",
      createdAt: now,
      expiresAt: now + 60_000,
    })
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: contentType })
    )
    await ctx.db.patch(uploadIntentId, { status: "registered", storageId })
    return { storageId, uploadIntentId }
  })
}

describe("Convex Phase 7 ownership and persistence", () => {
  test("isolates template reads and indexed history by anonymous session", async () => {
    const t = convexTest(schema, modules)
    const templateId = await t.mutation(
      api.templates.create,
      createTemplateArgs()
    )

    expect(
      await t.query(api.templates.get, { sessionId: sessionA, templateId })
    ).toMatchObject({ _id: templateId, sessionId: sessionA, sourceHash })
    expect(
      await t.query(api.templates.get, { sessionId: sessionB, templateId })
    ).toBeNull()
    expect(
      await t.query(api.templates.findBySourceHash, {
        sessionId: sessionB,
        sourceHash,
      })
    ).toBeNull()

    const page = await t.query(api.templates.list, {
      sessionId: sessionA,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(page.page.map(({ _id }) => _id)).toEqual([templateId])
  })

  test("validates stored artifact metadata and only reuses persisted PDFs", async () => {
    const t = convexTest(schema, modules)
    const docxUpload = await registeredUpload(t, "docx", "synthetic-docx")
    const templateId = await t.mutation(api.templates.create, {
      ...createTemplateArgs(),
      originalFileUploadIntentId: docxUpload.uploadIntentId,
    })
    const renderId = await t.mutation(api.renders.begin, {
      sessionId: sessionA,
      templateId,
      templateHash: sourceHash,
      fontRegistryHash,
      dataHash,
      optionsHash,
      cacheKey,
      diagnosticsSummary,
    })

    await t.mutation(api.renders.complete, {
      sessionId: sessionA,
      renderId,
      pageCount: 2,
      diagnosticsSummary,
    })
    expect(
      await t.query(api.renders.findCached, { sessionId: sessionA, cacheKey })
    ).toBeNull()

    const persistedCacheKey = "f".repeat(64)
    const persistedRenderId = await t.mutation(api.renders.begin, {
      sessionId: sessionA,
      templateId,
      templateHash: sourceHash,
      fontRegistryHash,
      dataHash,
      optionsHash,
      cacheKey: persistedCacheKey,
      diagnosticsSummary,
    })
    const pdfUpload = await registeredUpload(t, "pdf", "%PDF-1.7\n")
    await t.mutation(api.renders.complete, {
      sessionId: sessionA,
      renderId: persistedRenderId,
      pdfUploadIntentId: pdfUpload.uploadIntentId,
      pageCount: 1,
      diagnosticsSummary,
    })

    expect(
      await t.query(api.renders.findCached, {
        sessionId: sessionA,
        cacheKey: persistedCacheKey,
      })
    ).toMatchObject({
      _id: persistedRenderId,
      pdfStorageId: pdfUpload.storageId,
    })
    expect(
      await t.query(api.renders.findCached, {
        sessionId: sessionB,
        cacheKey: persistedCacheKey,
      })
    ).toBeNull()
  })

  test("rejects a render hash that is not bound to the owned template", async () => {
    const t = convexTest(schema, modules)
    const templateId = await t.mutation(
      api.templates.create,
      createTemplateArgs()
    )

    await expect(
      t.mutation(api.renders.begin, {
        sessionId: sessionA,
        templateId,
        templateHash: "9".repeat(64),
        fontRegistryHash,
        dataHash,
        optionsHash,
        cacheKey,
        diagnosticsSummary,
      })
    ).rejects.toThrow("does not match")
  })

  test("deletes render and template storage through bounded internal cleanup", async () => {
    const t = convexTest(schema, modules)
    const docxUpload = await registeredUpload(t, "docx", "synthetic-docx")
    const templateId = await t.mutation(api.templates.create, {
      ...createTemplateArgs(),
      originalFileUploadIntentId: docxUpload.uploadIntentId,
    })
    const renderId = await t.mutation(api.renders.begin, {
      sessionId: sessionA,
      templateId,
      templateHash: sourceHash,
      fontRegistryHash,
      dataHash,
      optionsHash,
      cacheKey,
      diagnosticsSummary,
    })
    const pdfUpload = await registeredUpload(t, "pdf", "%PDF-1.7\n")
    await t.mutation(api.renders.complete, {
      sessionId: sessionA,
      renderId,
      pdfUploadIntentId: pdfUpload.uploadIntentId,
      pageCount: 1,
      diagnosticsSummary,
    })

    await t.mutation(api.templates.remove, { sessionId: sessionA, templateId })
    await t.mutation(internal.templates.deleteTemplateBatch, {
      sessionId: sessionA,
      templateId,
    })
    await t.mutation(internal.templates.deleteTemplateBatch, {
      sessionId: sessionA,
      templateId,
    })

    expect(
      await t.query(api.templates.get, { sessionId: sessionA, templateId })
    ).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", docxUpload.storageId))
    ).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", pdfUpload.storageId))
    ).toBeNull()
  })
})
