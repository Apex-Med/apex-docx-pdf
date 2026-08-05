import { SessionIdArg } from "convex-helpers/server/sessions"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server"
import { createUploadUrl, deleteStoredFile } from "./storageAccess"
import { assertSessionId } from "./validation"

export type UploadKind = "docx" | "pdf"

// Convex generated upload URLs are documented as valid for one hour. Keep the
// intent alive slightly longer so a late POST cannot outlive its cleanup key.
const UPLOAD_INTENT_TTL_MS = 65 * 60 * 1_000
const CLEANUP_BATCH_SIZE = 25
const STORAGE_MATCH_BATCH_SIZE = 4

export const generateUploadUrl = mutation({
  args: {
    ...SessionIdArg,
    kind: v.union(v.literal("docx"), v.literal("pdf")),
  },
  returns: v.object({
    uploadUrl: v.string(),
    uploadIntentId: v.id("uploadIntents"),
    uploadContentType: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId)
    const createdAt = Date.now()
    const expiresAt = createdAt + UPLOAD_INTENT_TTL_MS
    const uploadIntentId = await ctx.db.insert("uploadIntents", {
      sessionId: args.sessionId,
      kind: args.kind,
      status: "awaitingUpload",
      createdAt,
      expiresAt,
    })
    const markedContentType = uploadContentType(args.kind, uploadIntentId)
    await ctx.db.patch(uploadIntentId, {
      uploadContentType: markedContentType,
    })
    const uploadUrl = await createUploadUrl(ctx)
    await ctx.scheduler.runAt(
      expiresAt,
      internal.storage.cleanupExpiredUploadIntents,
      { cutoff: expiresAt }
    )
    return {
      uploadUrl,
      uploadIntentId,
      uploadContentType: markedContentType,
      expiresAt,
    }
  },
})

export const registerUploadedFile = mutation({
  args: {
    ...SessionIdArg,
    uploadIntentId: v.id("uploadIntents"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId)
    const intent = await ctx.db.get(args.uploadIntentId)
    if (
      !intent ||
      intent.sessionId !== args.sessionId ||
      intent.status !== "awaitingUpload" ||
      intent.expiresAt < Date.now()
    ) {
      throw new Error("Active upload intent not found")
    }
    const storedFile = await ctx.db.system.get("_storage", args.storageId)
    if (
      !storedFile ||
      !validStoredArtifact(intent.kind, intent.uploadContentType, storedFile)
    ) {
      throw new Error("Uploaded artifact is missing or invalid")
    }
    await ctx.db.patch(intent._id, {
      status: "registered",
      storageId: args.storageId,
    })
    return null
  },
})

export async function consumeRegisteredUpload(
  ctx: MutationCtx,
  args: Readonly<{
    sessionId: string
    uploadIntentId: Id<"uploadIntents">
    kind: UploadKind
  }>
): Promise<Id<"_storage">> {
  const intent = await ctx.db.get(args.uploadIntentId)
  if (
    !intent ||
    intent.sessionId !== args.sessionId ||
    intent.kind !== args.kind ||
    intent.status !== "registered" ||
    !intent.storageId ||
    intent.expiresAt < Date.now()
  ) {
    throw new Error("Registered upload intent not found")
  }
  const storedFile = await ctx.db.system.get("_storage", intent.storageId)
  if (
    !storedFile ||
    !validStoredArtifact(intent.kind, intent.uploadContentType, storedFile)
  ) {
    throw new Error("Registered upload artifact is missing or invalid")
  }
  await ctx.db.patch(intent._id, { status: "consumed" })
  return intent.storageId
}

export const cleanupExpiredUploadIntents = internalMutation({
  args: { cutoff: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.cutoff) || args.cutoff < 0) {
      throw new Error("Invalid upload-intent cleanup cutoff")
    }
    const intents = await ctx.db
      .query("uploadIntents")
      .withIndex("by_expiresAt", (query) => query.lte("expiresAt", args.cutoff))
      .order("asc")
      .take(CLEANUP_BATCH_SIZE)
    let needsAnotherPass = false
    for (const intent of intents) {
      const matchingFiles = intent.uploadContentType
        ? await ctx.db.system
            .query("_storage")
            .withIndex("by_creation_time", (query) =>
              query
                .gte("_creationTime", intent.createdAt)
                .lte("_creationTime", intent.expiresAt)
            )
            .filter((query) =>
              query.eq(query.field("contentType"), intent.uploadContentType)
            )
            .take(STORAGE_MATCH_BATCH_SIZE)
        : []
      const protectedStorageId =
        intent.status === "consumed" ? intent.storageId : undefined
      for (const file of matchingFiles) {
        if (file._id !== protectedStorageId) {
          await deleteStoredFile(ctx, file._id)
        }
      }
      if (matchingFiles.length === STORAGE_MATCH_BATCH_SIZE) {
        needsAnotherPass = true
        continue
      }
      if (
        intent.storageId &&
        intent.status !== "consumed" &&
        !matchingFiles.some((file) => file._id === intent.storageId)
      ) {
        await deleteStoredFile(ctx, intent.storageId)
      }
      await ctx.db.delete(intent._id)
    }
    if (intents.length === CLEANUP_BATCH_SIZE || needsAnotherPass) {
      await ctx.scheduler.runAfter(
        0,
        internal.storage.cleanupExpiredUploadIntents,
        { cutoff: args.cutoff }
      )
    }
    return null
  },
})

function validStoredArtifact(
  kind: UploadKind,
  markedContentType: string | undefined,
  storedFile: Readonly<{ size: number; contentType?: string }>
): boolean {
  const expectedType =
    kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf"
  const maximumBytes = kind === "docx" ? 20_000_000 : 100_000_000
  return (
    storedFile.size > 0 &&
    storedFile.size <= maximumBytes &&
    (markedContentType
      ? storedFile.contentType === markedContentType
      : storedFile.contentType === undefined ||
        storedFile.contentType === expectedType)
  )
}

function uploadContentType(
  kind: UploadKind,
  uploadIntentId: Id<"uploadIntents">
): string {
  const mediaType =
    kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf"
  return `${mediaType}; apex-upload-intent=${uploadIntentId}`
}
