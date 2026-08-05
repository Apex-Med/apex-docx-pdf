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
    const docxStorageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["synthetic-docx"], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    )
    const templateId = await t.mutation(api.templates.create, {
      ...createTemplateArgs(),
      originalFileStorageId: docxStorageId,
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
    const pdfStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["%PDF-1.7\n"], { type: "application/pdf" }))
    )
    await t.mutation(api.renders.complete, {
      sessionId: sessionA,
      renderId: persistedRenderId,
      pdfStorageId,
      pageCount: 1,
      diagnosticsSummary,
    })

    expect(
      await t.query(api.renders.findCached, {
        sessionId: sessionA,
        cacheKey: persistedCacheKey,
      })
    ).toMatchObject({ _id: persistedRenderId, pdfStorageId })
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
    const docxStorageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["synthetic-docx"], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    )
    const templateId = await t.mutation(api.templates.create, {
      ...createTemplateArgs(),
      originalFileStorageId: docxStorageId,
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
    const pdfStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["%PDF-1.7\n"], { type: "application/pdf" }))
    )
    await t.mutation(api.renders.complete, {
      sessionId: sessionA,
      renderId,
      pdfStorageId,
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
      await t.run((ctx) => ctx.db.system.get("_storage", docxStorageId))
    ).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", pdfStorageId))
    ).toBeNull()
  })
})
