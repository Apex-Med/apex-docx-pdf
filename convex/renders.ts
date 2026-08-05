import { SessionIdArg } from "convex-helpers/server/sessions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { deleteStoredFile, getBearerUrl } from "./storageAccess";
import {
  assertBoundedLimit,
  assertDiagnosticsSummary,
  assertHash,
  assertPageCount,
  assertPaginationOptions,
  assertSessionId,
  diagnosticsSummaryValidator,
  renderValidator,
} from "./validation";

const emptyDiagnostics = {
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
  codes: [],
};

export const list = query({
  args: { ...SessionIdArg, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(renderValidator),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertPaginationOptions(args.paginationOpts);
    return await ctx.db
      .query("renders")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", args.sessionId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const recent = query({
  args: { ...SessionIdArg, limit: v.number() },
  returns: v.array(renderValidator),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertBoundedLimit(args.limit);
    return await ctx.db
      .query("renders")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", args.sessionId),
      )
      .order("desc")
      .take(args.limit);
  },
});

export const findCached = query({
  args: { ...SessionIdArg, cacheKey: v.string() },
  returns: v.union(renderValidator, v.null()),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertHash("Cache key", args.cacheKey);
    return await ctx.db
      .query("renders")
      .withIndex("by_sessionId_and_cacheKey_and_status", (q) =>
        q
          .eq("sessionId", args.sessionId)
          .eq("cacheKey", args.cacheKey)
          .eq("status", "complete"),
      )
      .order("desc")
      .first();
  },
});

export const begin = mutation({
  args: {
    ...SessionIdArg,
    templateId: v.id("templates"),
    templateHash: v.string(),
    fontRegistryHash: v.string(),
    dataHash: v.string(),
    optionsHash: v.string(),
    cacheKey: v.string(),
  },
  returns: v.id("renders"),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertHash("Template hash", args.templateHash);
    assertHash("Font registry hash", args.fontRegistryHash);
    assertHash("Data hash", args.dataHash);
    assertHash("Options hash", args.optionsHash);
    assertHash("Cache key", args.cacheKey);
    const template = await ctx.db.get(args.templateId);
    if (
      !template ||
      template.sessionId !== args.sessionId ||
      template.status !== "ready"
    ) {
      throw new Error("Ready template not found");
    }
    return await ctx.db.insert("renders", {
      sessionId: args.sessionId,
      templateId: args.templateId,
      templateHash: args.templateHash,
      fontRegistryHash: args.fontRegistryHash,
      dataHash: args.dataHash,
      optionsHash: args.optionsHash,
      cacheKey: args.cacheKey,
      status: "queued",
      diagnosticsSummary: emptyDiagnostics,
      createdAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: {
    ...SessionIdArg,
    renderId: v.id("renders"),
    pdfStorageId: v.optional(v.id("_storage")),
    pageCount: v.number(),
    diagnosticsSummary: diagnosticsSummaryValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertPageCount(args.pageCount);
    assertDiagnosticsSummary(args.diagnosticsSummary);
    const render = await ctx.db.get(args.renderId);
    if (!render || render.sessionId !== args.sessionId) {
      throw new Error("Render not found");
    }
    if (render.status !== "queued" && render.status !== "rendering") {
      throw new Error("Render cannot be completed from its current state");
    }
    await ctx.db.patch(render._id, {
      ...(args.pdfStorageId ? { pdfStorageId: args.pdfStorageId } : {}),
      pageCount: args.pageCount,
      status: "complete",
      diagnosticsSummary: args.diagnosticsSummary,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const fail = mutation({
  args: {
    ...SessionIdArg,
    renderId: v.id("renders"),
    diagnosticsSummary: diagnosticsSummaryValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertDiagnosticsSummary(args.diagnosticsSummary);
    const render = await ctx.db.get(args.renderId);
    if (!render || render.sessionId !== args.sessionId) {
      throw new Error("Render not found");
    }
    if (render.status !== "queued" && render.status !== "rendering") {
      throw new Error("Render cannot fail from its current state");
    }
    await ctx.db.patch(render._id, {
      status: "failed",
      diagnosticsSummary: args.diagnosticsSummary,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const cancel = mutation({
  args: { ...SessionIdArg, renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    const render = await ctx.db.get(args.renderId);
    if (!render || render.sessionId !== args.sessionId) {
      throw new Error("Render not found");
    }
    if (render.status !== "queued" && render.status !== "rendering") {
      throw new Error("Render cannot be cancelled from its current state");
    }
    await ctx.db.patch(render._id, {
      status: "cancelled",
      completedAt: Date.now(),
    });
    return null;
  },
});

export const getPdfUrl = query({
  args: { ...SessionIdArg, renderId: v.id("renders") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    const render = await ctx.db.get(args.renderId);
    if (
      !render ||
      render.sessionId !== args.sessionId ||
      render.status !== "complete" ||
      !render.pdfStorageId
    ) {
      return null;
    }
    return await getBearerUrl(ctx, render.pdfStorageId);
  },
});

export const remove = mutation({
  args: { ...SessionIdArg, renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSessionId(args.sessionId);
    const render = await ctx.db.get(args.renderId);
    if (!render || render.sessionId !== args.sessionId) {
      throw new Error("Render not found");
    }
    if (render.status !== "deleting") {
      await ctx.db.patch(render._id, { status: "deleting" });
    }
    await ctx.scheduler.runAfter(0, internal.renders.deleteRender, {
      sessionId: args.sessionId,
      renderId: args.renderId,
    });
    return null;
  },
});

export const deleteRender = internalMutation({
  args: { ...SessionIdArg, renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    const render = await ctx.db.get(args.renderId);
    if (
      !render ||
      render.sessionId !== args.sessionId ||
      render.status !== "deleting"
    ) {
      return null;
    }
    if (render.pdfStorageId) {
      await deleteStoredFile(ctx, render.pdfStorageId);
    }
    await ctx.db.delete(render._id);
    return null;
  },
});
