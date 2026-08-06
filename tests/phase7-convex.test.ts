import { describe, expect, test } from "bun:test"
import type { SessionId } from "convex-helpers/server/sessions"
import { convexTest } from "convex-test"
import type { Id } from "../convex/_generated/dataModel"
import { api, internal } from "../convex/_generated/api"
import schema from "../convex/schema"

const modules = {
  "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
  "../convex/renders.ts": () => import("../convex/renders"),
  "../convex/storage.ts": () => import("../convex/storage"),
  "../convex/storageAccess.ts": () => import("../convex/storageAccess"),
  "../convex/storageValidation.ts": () => import("../convex/storageValidation"),
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

function validDocxBytes(
  extraParts: Readonly<Record<string, string>> = {}
): Uint8Array {
  return storedZip({
    "[Content_Types].xml": "<Types/>",
    "_rels/.rels": "<Relationships/>",
    "word/document.xml": "<w:document/>",
    ...extraParts,
  })
}

function storedZip(parts: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const directoryParts: Uint8Array[] = []
  let localOffset = 0

  for (const [name, value] of Object.entries(parts)) {
    const nameBytes = encoder.encode(name)
    const valueBytes = encoder.encode(value)
    const local = new Uint8Array(30 + nameBytes.length + valueBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint32(18, valueBytes.length, true)
    localView.setUint32(22, valueBytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(valueBytes, 30 + nameBytes.length)
    localParts.push(local)

    const directory = new Uint8Array(46 + nameBytes.length)
    const directoryView = new DataView(directory.buffer)
    directoryView.setUint32(0, 0x02014b50, true)
    directoryView.setUint16(4, 20, true)
    directoryView.setUint16(6, 20, true)
    directoryView.setUint32(20, valueBytes.length, true)
    directoryView.setUint32(24, valueBytes.length, true)
    directoryView.setUint16(28, nameBytes.length, true)
    directoryView.setUint32(42, localOffset, true)
    directory.set(nameBytes, 46)
    directoryParts.push(directory)
    localOffset += local.length
  }

  const directorySize = directoryParts.reduce(
    (total, part) => total + part.length,
    0
  )
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, directoryParts.length, true)
  endView.setUint16(10, directoryParts.length, true)
  endView.setUint32(12, directorySize, true)
  endView.setUint32(16, localOffset, true)

  const archive = new Uint8Array(localOffset + directorySize + end.length)
  let offset = 0
  for (const part of [...localParts, ...directoryParts, end]) {
    archive.set(part, offset)
    offset += part.length
  }
  return archive
}

function withDeclaredUncompressedSize(
  archive: Uint8Array,
  size: number
): Uint8Array {
  const bytes = archive.slice()
  const view = new DataView(bytes.buffer)
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, size, true)
      return bytes
    }
  }
  throw new Error("Test ZIP central directory is missing")
}

async function storeGeneratedUpload(
  t: ReturnType<typeof testBackend>,
  kind: "docx" | "pdf",
  bytes: BlobPart,
  contentType?: string
) {
  const generated = await t.mutation(api.storage.generateUploadUrl, {
    sessionId: SESSION_A,
    kind,
  })
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(
      new Blob([bytes], {
        type: contentType ?? generated.uploadContentType,
      })
    )
  )
  return { ...generated, storageId }
}

async function storeTestUpload(
  t: ReturnType<typeof testBackend>,
  kind: "docx" | "pdf",
  bytes: BlobPart
) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const uploadIntentId = await ctx.db.insert("uploadIntents", {
      sessionId: SESSION_A,
      kind,
      status: "awaitingUpload",
      createdAt: now,
      expiresAt: now + 60_000,
    })
    const storageId = await ctx.storage.store(new Blob([bytes]))
    return { uploadIntentId, storageId }
  })
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

  test("validates DOCX and PDF bytes before one-time upload-intent consumption", async () => {
    const t = testBackend()
    const now = Date.now()
    const markedUpload = await storeGeneratedUpload(t, "docx", validDocxBytes())
    expect(markedUpload.uploadUrl).toStartWith("https://")
    expect(markedUpload.uploadContentType).toBe(
      `application/vnd.openxmlformats-officedocument.wordprocessingml.document; apex-upload-intent=${markedUpload.uploadIntentId}`
    )
    expect(markedUpload.expiresAt).toBeGreaterThan(now)
    expect(
      await t.run(async (ctx) => await ctx.db.get(markedUpload.uploadIntentId))
    ).toMatchObject({ uploadContentType: markedUpload.uploadContentType })
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: markedUpload.uploadIntentId,
        storageId: markedUpload.storageId,
      })
    ).rejects.toThrow("Uploaded artifact is missing or invalid")

    const docxUpload = await storeTestUpload(t, "docx", validDocxBytes())
    expect(
      await t.run(async (ctx) => await ctx.db.get(docxUpload.uploadIntentId))
    ).toMatchObject({
      sessionId: SESSION_A,
      kind: "docx",
      status: "awaitingUpload",
    })

    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_B,
        uploadIntentId: docxUpload.uploadIntentId,
        storageId: docxUpload.storageId,
      })
    ).rejects.toThrow("Uploaded artifact is missing or invalid")
    await t.action(api.storage.registerUploadedFile, {
      sessionId: SESSION_A,
      uploadIntentId: docxUpload.uploadIntentId,
      storageId: docxUpload.storageId,
    })
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: docxUpload.uploadIntentId,
        storageId: docxUpload.storageId,
      })
    ).rejects.toThrow("Uploaded artifact is missing or invalid")

    const templateId = await t.mutation(api.templates.create, {
      sessionId: SESSION_A,
      originalFileUploadIntentId: docxUpload.uploadIntentId,
      ...templateMetadata(),
    })
    expect(
      await t.run(async (ctx) => await ctx.db.get(docxUpload.uploadIntentId))
    ).toMatchObject({ status: "consumed", storageId: docxUpload.storageId })
    expect(
      await t.run(async (ctx) => await ctx.db.get(templateId))
    ).toMatchObject({ originalFileStorageId: docxUpload.storageId })
    await expect(
      t.mutation(api.templates.create, {
        sessionId: SESSION_A,
        originalFileUploadIntentId: docxUpload.uploadIntentId,
        ...templateMetadata({ sourceHash: HASH_B }),
      })
    ).rejects.toThrow("Registered upload intent not found")

    const pdfUpload = await storeTestUpload(
      t,
      "pdf",
      "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
    )
    await t.action(api.storage.registerUploadedFile, {
      sessionId: SESSION_A,
      uploadIntentId: pdfUpload.uploadIntentId,
      storageId: pdfUpload.storageId,
    })
    expect(
      await t.run(async (ctx) => await ctx.db.get(pdfUpload.uploadIntentId))
    ).toMatchObject({ status: "registered", storageId: pdfUpload.storageId })
  })

  test("rejects mislabeled, arbitrary, incomplete, and oversized stored artifacts", async () => {
    const t = testBackend()
    const unmarked = await storeGeneratedUpload(
      t,
      "docx",
      validDocxBytes(),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: unmarked.uploadIntentId,
        storageId: unmarked.storageId,
      })
    ).rejects.toThrow("Uploaded artifact is missing or invalid")

    const arbitraryDocx = await storeTestUpload(t, "docx", "not-a-zip")
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: arbitraryDocx.uploadIntentId,
        storageId: arbitraryDocx.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const incompleteDocx = await storeTestUpload(
      t,
      "docx",
      storedZip({ "[Content_Types].xml": "<Types/>" })
    )
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: incompleteDocx.uploadIntentId,
        storageId: incompleteDocx.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const expansionBomb = await storeTestUpload(
      t,
      "docx",
      withDeclaredUncompressedSize(validDocxBytes(), 100_000_001)
    )
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: expansionBomb.uploadIntentId,
        storageId: expansionBomb.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const arbitraryPdf = await storeTestUpload(t, "pdf", "not-a-pdf")
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: arbitraryPdf.uploadIntentId,
        storageId: arbitraryPdf.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const mislabeledPdf = await storeTestUpload(t, "pdf", validDocxBytes())
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: mislabeledPdf.uploadIntentId,
        storageId: mislabeledPdf.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const oversizedDocx = await storeTestUpload(
      t,
      "docx",
      new Uint8Array(20_000_001)
    )
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: oversizedDocx.uploadIntentId,
        storageId: oversizedDocx.storageId,
      })
    ).rejects.toThrow("Uploaded artifact is missing or invalid")
  })

  test("cleanup reclaims content-invalid and registered-but-unconsumed uploads", async () => {
    const t = testBackend()
    const now = Date.now()
    const invalidUpload = await storeTestUpload(t, "pdf", "not-a-pdf")
    await expect(
      t.action(api.storage.registerUploadedFile, {
        sessionId: SESSION_A,
        uploadIntentId: invalidUpload.uploadIntentId,
        storageId: invalidUpload.storageId,
      })
    ).rejects.toThrow("Uploaded artifact content is invalid")

    const registeredUpload = await storeTestUpload(
      t,
      "pdf",
      "%PDF-2.0\n%%EOF\n"
    )
    await t.action(api.storage.registerUploadedFile, {
      sessionId: SESSION_A,
      uploadIntentId: registeredUpload.uploadIntentId,
      storageId: registeredUpload.storageId,
    })
    await t.run(async (ctx) => {
      for (const uploadIntentId of [
        invalidUpload.uploadIntentId,
        registeredUpload.uploadIntentId,
      ]) {
        await ctx.db.patch(uploadIntentId, { expiresAt: now - 1 })
      }
      await ctx.db.patch(invalidUpload.uploadIntentId, {
        storageId: invalidUpload.storageId,
      })
    })

    await t.mutation(internal.storage.cleanupExpiredUploadIntents, {
      cutoff: now,
    })
    for (const upload of [invalidUpload, registeredUpload]) {
      expect(
        await t.run(async (ctx) => await ctx.db.get(upload.uploadIntentId))
      ).toBeNull()
      expect(
        await t.run(async (ctx) =>
          ctx.db.system.get("_storage", upload.storageId)
        )
      ).toBeNull()
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
