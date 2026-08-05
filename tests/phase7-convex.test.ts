import { describe, expect, test } from "bun:test"
import type { SessionId } from "convex-helpers/server/sessions"
import { convexTest } from "convex-test"
import type { Id } from "../convex/_generated/dataModel"
import { api } from "../convex/_generated/api"
import schema from "../convex/schema"

const modules = {
  "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
  "../convex/renders.ts": () => import("../convex/renders"),
  "../convex/storage.ts": () => import("../convex/storage"),
  "../convex/storageAccess.ts": () => import("../convex/storageAccess"),
  "../convex/templates.ts": () => import("../convex/templates"),
  "../convex/validation.ts": () => import("../convex/validation"),
}

const SESSION_A = "anonymous-session-a" as SessionId
const SESSION_B = "anonymous-session-b" as SessionId
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const HASH_C = "c".repeat(64)
const HASH_D = "d".repeat(64)
const HASH_E = "e".repeat(64)

const EMPTY_DIAGNOSTICS = {
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
  codes: [] as string[],
}

function templateMetadata(
  overrides: Partial<{
    name: string
    sourceHash: string
    engineVersion: string
    manifestJson: string
    jsonSchemaJson: string
    starterDataJson: string
    status: "ready" | "invalid"
    diagnosticsSummary: typeof EMPTY_DIAGNOSTICS
  }> = {}
) {
  return {
    name: "Example template",
    sourceHash: HASH_A,
    engineVersion: "phase-7",
    manifestJson: "{}",
    jsonSchemaJson: "{}",
    starterDataJson: "{}",
    status: "ready" as const,
    diagnosticsSummary: EMPTY_DIAGNOSTICS,
    ...overrides,
  }
}

function renderInput(templateId: Id<"templates">, templateHash = HASH_A) {
  return {
    templateId,
    templateHash,
    fontRegistryHash: HASH_B,
    dataHash: HASH_C,
    optionsHash: HASH_D,
    cacheKey: HASH_E,
    diagnosticsSummary: EMPTY_DIAGNOSTICS,
  }
}

function testBackend() {
  return convexTest({ schema, modules })
}

async function createTemplate(
  t: ReturnType<typeof testBackend>,
  sessionId = SESSION_A,
  overrides: Parameters<typeof templateMetadata>[0] = {}
) {
  return await t.mutation(api.templates.create, {
    sessionId,
    ...templateMetadata(overrides),
  })
}

async function createRender(
  t: ReturnType<typeof testBackend>,
  templateId: Id<"templates">,
  sessionId = SESSION_A,
  templateHash = HASH_A
) {
  return await t.mutation(api.renders.begin, {
    sessionId,
    ...renderInput(templateId, templateHash),
  })
}

describe("Phase 7 Convex persistence", () => {
  test("template reads and mutations are isolated by anonymous session", async () => {
    const t = testBackend()
    const ownedId = await createTemplate(t)
    const foreignId = await createTemplate(t, SESSION_B, {
      sourceHash: HASH_B,
      name: "Foreign template",
    })

    const page = await t.query(api.templates.list, {
      sessionId: SESSION_A,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(page.page.map((template) => template._id)).toEqual([ownedId])
    expect(
      await t.query(api.templates.get, {
        sessionId: SESSION_A,
        templateId: foreignId,
      })
    ).toBeNull()
    expect(
      await t.query(api.templates.findBySourceHash, {
        sessionId: SESSION_A,
        sourceHash: HASH_B,
      })
    ).toBeNull()

    await expect(
      t.mutation(api.templates.updateMetadata, {
        sessionId: SESSION_A,
        templateId: foreignId,
        ...templateMetadata({ sourceHash: HASH_B }),
      })
    ).rejects.toThrow("Template not found")
    await expect(
      t.mutation(api.templates.remove, {
        sessionId: SESSION_A,
        templateId: foreignId,
      })
    ).rejects.toThrow("Template not found")

    expect(
      await t.query(api.templates.get, {
        sessionId: SESSION_B,
        templateId: foreignId,
      })
    ).not.toBeNull()
  })

  test("render reads and mutations are isolated by anonymous session", async () => {
    const t = testBackend()
    const templateId = await createTemplate(t)
    const renderId = await createRender(t, templateId)

    const page = await t.query(api.renders.list, {
      sessionId: SESSION_B,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(page.page).toEqual([])
    expect(
      await t.query(api.renders.recent, { sessionId: SESSION_B, limit: 10 })
    ).toEqual([])
    expect(
      await t.query(api.renders.findCached, {
        sessionId: SESSION_B,
        cacheKey: HASH_E,
      })
    ).toBeNull()
    expect(
      await t.query(api.renders.getPdfUrl, {
        sessionId: SESSION_B,
        renderId,
      })
    ).toBeNull()

    await expect(
      t.mutation(api.renders.complete, {
        sessionId: SESSION_B,
        renderId,
        pageCount: 1,
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
      })
    ).rejects.toThrow("Render not found")
    await expect(
      t.mutation(api.renders.fail, {
        sessionId: SESSION_B,
        renderId,
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
      })
    ).rejects.toThrow("Render not found")
    await expect(
      t.mutation(api.renders.cancel, { sessionId: SESSION_B, renderId })
    ).rejects.toThrow("Render not found")
    await expect(
      t.mutation(api.renders.remove, { sessionId: SESSION_B, renderId })
    ).rejects.toThrow("Render not found")
  })

  test("SHA-256 validation rejects malformed lookup and render inputs", async () => {
    const t = testBackend()
    const templateId = await createTemplate(t)

    await expect(
      createTemplate(t, SESSION_A, { sourceHash: "A".repeat(64) })
    ).rejects.toThrow("lowercase SHA-256")
    await expect(
      t.query(api.templates.findBySourceHash, {
        sessionId: SESSION_A,
        sourceHash: "short",
      })
    ).rejects.toThrow("lowercase SHA-256")
    await expect(
      t.query(api.renders.findCached, {
        sessionId: SESSION_A,
        cacheKey: `${HASH_E} `,
      })
    ).rejects.toThrow("lowercase SHA-256")

    for (const field of [
      "templateHash",
      "fontRegistryHash",
      "dataHash",
      "optionsHash",
      "cacheKey",
    ] as const) {
      await expect(
        t.mutation(api.renders.begin, {
          sessionId: SESSION_A,
          ...renderInput(templateId),
          [field]: "not-a-sha256",
        })
      ).rejects.toThrow("lowercase SHA-256")
    }
  })

  test("template metadata validation rejects malformed bounded fields", async () => {
    const t = testBackend()

    await expect(
      createTemplate(t, SESSION_A, { name: " padded " })
    ).rejects.toThrow("trimmed characters")
    await expect(
      createTemplate(t, SESSION_A, { engineVersion: " phase-7" })
    ).rejects.toThrow("Invalid engine version")
    await expect(
      createTemplate(t, SESSION_A, { manifestJson: "{" })
    ).rejects.toThrow("Manifest must be valid JSON")
    await expect(
      createTemplate(t, SESSION_A, {
        diagnosticsSummary: {
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          codes: ["DUPLICATE", "DUPLICATE"],
        },
      })
    ).rejects.toThrow("unique stable codes")
  })

  test("indexed source-hash lookup returns only the owning session's template", async () => {
    const t = testBackend()
    const ownedId = await createTemplate(t, SESSION_A, { sourceHash: HASH_C })
    await createTemplate(t, SESSION_B, { sourceHash: HASH_C })

    const found = await t.query(api.templates.findBySourceHash, {
      sessionId: SESSION_A,
      sourceHash: HASH_C,
    })
    expect(found?._id).toBe(ownedId)
  })

  test("begin requires an owned ready template with a matching hash", async () => {
    const t = testBackend()
    const readyId = await createTemplate(t)
    const invalidId = await createTemplate(t, SESSION_A, {
      sourceHash: HASH_B,
      status: "invalid",
    })
    const foreignId = await createTemplate(t, SESSION_B)

    await expect(createRender(t, invalidId, SESSION_A, HASH_B)).rejects.toThrow(
      "Ready template not found"
    )
    await expect(createRender(t, foreignId)).rejects.toThrow(
      "Ready template not found"
    )
    await expect(createRender(t, readyId, SESSION_A, HASH_B)).rejects.toThrow(
      "does not match"
    )

    const renderId = await createRender(t, readyId)
    const render = await t.run(async (ctx) => await ctx.db.get(renderId))
    expect(render?.status).toBe("rendering")
    expect(render?.templateHash).toBe(HASH_A)
  })

  test("complete, fail, and cancel enforce terminal lifecycle transitions", async () => {
    const t = testBackend()
    const templateId = await createTemplate(t)
    const completeId = await createRender(t, templateId)
    const failId = await createRender(t, templateId)
    const cancelId = await createRender(t, templateId)

    await t.mutation(api.renders.complete, {
      sessionId: SESSION_A,
      renderId: completeId,
      pageCount: 2,
      diagnosticsSummary: EMPTY_DIAGNOSTICS,
    })
    await t.mutation(api.renders.fail, {
      sessionId: SESSION_A,
      renderId: failId,
      diagnosticsSummary: {
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        codes: ["RENDER_FAILED"],
      },
    })
    await t.mutation(api.renders.cancel, {
      sessionId: SESSION_A,
      renderId: cancelId,
    })

    const [completed, failed, cancelled] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get(completeId),
        ctx.db.get(failId),
        ctx.db.get(cancelId),
      ])
    )
    expect(completed?.status).toBe("complete")
    expect(completed?.pageCount).toBe(2)
    expect(completed?.completedAt).toBeNumber()
    expect(failed?.status).toBe("failed")
    expect(failed?.completedAt).toBeNumber()
    expect(cancelled?.status).toBe("cancelled")
    expect(cancelled?.completedAt).toBeNumber()

    await expect(
      t.mutation(api.renders.cancel, {
        sessionId: SESSION_A,
        renderId: completeId,
      })
    ).rejects.toThrow("current state")
    await expect(
      t.mutation(api.renders.complete, {
        sessionId: SESSION_A,
        renderId: failId,
        pageCount: 1,
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
      })
    ).rejects.toThrow("current state")
    await expect(
      t.mutation(api.renders.fail, {
        sessionId: SESSION_A,
        renderId: cancelId,
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
      })
    ).rejects.toThrow("current state")
  })

  test("cache lookup returns only a completed render with persisted PDF storage", async () => {
    const t = testBackend()
    const templateId = await createTemplate(t)
    const storageId = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(["pdf-bytes"]))
    )

    await t.run(async (ctx) => {
      const base = {
        sessionId: SESSION_A,
        templateId,
        templateHash: HASH_A,
        fontRegistryHash: HASH_B,
        dataHash: HASH_C,
        optionsHash: HASH_D,
        cacheKey: HASH_E,
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
      }
      await ctx.db.insert("renders", {
        ...base,
        status: "rendering",
        pdfStorageId: storageId,
        createdAt: 1,
      })
      await ctx.db.insert("renders", {
        ...base,
        status: "complete",
        pageCount: 1,
        createdAt: 2,
        completedAt: 2,
      })
      await ctx.db.insert("renders", {
        ...base,
        status: "complete",
        pdfStorageId: storageId,
        pageCount: 1,
        createdAt: 3,
        completedAt: 3,
      })
    })

    const cached = await t.query(api.renders.findCached, {
      sessionId: SESSION_A,
      cacheKey: HASH_E,
    })
    expect(cached?.status).toBe("complete")
    expect(cached?.pdfStorageId).toBe(storageId)
    expect(cached?.createdAt).toBe(3)
    expect(
      await t.query(api.renders.findCached, {
        sessionId: SESSION_B,
        cacheKey: HASH_E,
      })
    ).toBeNull()
  })

  test("recent is newest-first, session-scoped, and bounded", async () => {
    const t = testBackend()
    const templateId = await createTemplate(t)

    await t.run(async (ctx) => {
      for (let createdAt = 1; createdAt <= 5; createdAt += 1) {
        await ctx.db.insert("renders", {
          sessionId: SESSION_A,
          templateId,
          templateHash: HASH_A,
          fontRegistryHash: HASH_B,
          dataHash: HASH_C,
          optionsHash: HASH_D,
          cacheKey: HASH_E,
          status: "rendering",
          diagnosticsSummary: EMPTY_DIAGNOSTICS,
          createdAt,
        })
      }
    })

    const recent = await t.query(api.renders.recent, {
      sessionId: SESSION_A,
      limit: 3,
    })
    expect(recent.map((render) => render.createdAt)).toEqual([5, 4, 3])

    for (const limit of [0, 1.5, 101]) {
      await expect(
        t.query(api.renders.recent, { sessionId: SESSION_A, limit })
      ).rejects.toThrow("Limit must be between 1 and 100")
    }
  })

  test("template removal drains bounded cascade batches and stored files", async () => {
    const t = testBackend()
    const originalStorageId = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(["docx-bytes"]))
    )
    const templateId = await t.run(async (ctx) => {
      return await ctx.db.insert("templates", {
        sessionId: SESSION_A,
        name: "Cascade template",
        originalFileStorageId: originalStorageId,
        sourceHash: HASH_A,
        engineVersion: "phase-7",
        manifestJson: "{}",
        jsonSchemaJson: "{}",
        starterDataJson: "{}",
        status: "ready",
        diagnosticsSummary: EMPTY_DIAGNOSTICS,
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const pdfStorageIds: Array<Id<"_storage">> = []
    await t.run(async (ctx) => {
      for (let index = 0; index < 30; index += 1) {
        const pdfStorageId = await ctx.storage.store(new Blob([`pdf-${index}`]))
        pdfStorageIds.push(pdfStorageId)
        await ctx.db.insert("renders", {
          sessionId: SESSION_A,
          templateId,
          templateHash: HASH_A,
          fontRegistryHash: HASH_B,
          dataHash: HASH_C,
          optionsHash: HASH_D,
          cacheKey: HASH_E,
          pdfStorageId,
          pageCount: 1,
          status: "complete",
          diagnosticsSummary: EMPTY_DIAGNOSTICS,
          createdAt: index,
          completedAt: index,
        })
      }
    })

    await t.mutation(api.templates.remove, {
      sessionId: SESSION_A,
      templateId,
    })
    await t.finishAllScheduledFunctions(() => {})

    const remaining = await t.run(async (ctx) => {
      const templates = await ctx.db.query("templates").collect()
      const renders = await ctx.db.query("renders").collect()
      const original = await ctx.storage.get(originalStorageId)
      const pdfs = await Promise.all(
        pdfStorageIds.map(async (storageId) => await ctx.storage.get(storageId))
      )
      return { templates, renders, original, pdfs }
    })
    expect(remaining.templates).toEqual([])
    expect(remaining.renders).toEqual([])
    expect(remaining.original).toBeNull()
    expect(remaining.pdfs.every((pdf) => pdf === null)).toBe(true)
  })
})
