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
  assertDiagnosticsSummary,
  assertEngineVersion,
  assertHash,
  assertJsonMetadata,
  assertName,
  assertPaginationOptions,
  assertSessionId,
  diagnosticsSummaryValidator,
  templateValidator,
} from "./validation";

const mutableTemplateMetadataArgs = {
  name: v.string(),
  sourceHash: v.string(),
  engineVersion: v.string(),
  manifestJson: v.string(),
  jsonSchemaJson: v.string(),
  starterDataJson: v.string(),
  status: v.union(v.literal("ready"), v.literal("invalid")),
  diagnosticsSummary: diagnosticsSummaryValidator,
};

function validateMetadata(args: {
  name: string;
  sourceHash: string;
  engineVersion: string;
  manifestJson: string;
  jsonSchemaJson: string;
  starterDataJson: string;
  diagnosticsSummary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    codes: string[];
  };
}): void {
  assertName(args.name);
  assertHash("Source hash", args.sourceHash);
  assertEngineVersion(args.engineVersion);
  assertJsonMetadata("Manifest", args.manifestJson, 512 * 1024);
  assertJsonMetadata("JSON schema", args.jsonSchemaJson, 256 * 1024);
  assertJsonMetadata("Starter data", args.starterDataJson, 512 * 1024);
  assertDiagnosticsSummary(args.diagnosticsSummary);
}

export const list = query({
  args: { ...SessionIdArg, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(templateValidator),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertPaginationOptions(args.paginationOpts);
    return await ctx.db
      .query("templates")
      .withIndex("by_sessionId_and_updatedAt", (q) =>
        q.eq("sessionId", args.sessionId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { ...SessionIdArg, templateId: v.id("templates") },
  returns: v.union(templateValidator, v.null()),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    const template = await ctx.db.get(args.templateId);
    return template?.sessionId === args.sessionId ? template : null;
  },
});

export const findBySourceHash = query({
  args: { ...SessionIdArg, sourceHash: v.string() },
  returns: v.union(templateValidator, v.null()),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    assertHash("Source hash", args.sourceHash);
    return await ctx.db
      .query("templates")
      .withIndex("by_sessionId_and_sourceHash", (q) =>
        q.eq("sessionId", args.sessionId).eq("sourceHash", args.sourceHash),
      )
      .order("desc")
      .first();
  },
});

export const create = mutation({
  args: {
    ...SessionIdArg,
    ...mutableTemplateMetadataArgs,
    originalFileStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("templates"),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    validateMetadata(args);
    const now = Date.now();
    return await ctx.db.insert("templates", {
      sessionId: args.sessionId,
      name: args.name,
      ...(args.originalFileStorageId
        ? { originalFileStorageId: args.originalFileStorageId }
        : {}),
      sourceHash: args.sourceHash,
      engineVersion: args.engineVersion,
      manifestJson: args.manifestJson,
      jsonSchemaJson: args.jsonSchemaJson,
      starterDataJson: args.starterDataJson,
      status: args.status,
      diagnosticsSummary: args.diagnosticsSummary,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMetadata = mutation({
  args: {
    ...SessionIdArg,
    templateId: v.id("templates"),
    ...mutableTemplateMetadataArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    validateMetadata(args);
    const template = await ctx.db.get(args.templateId);
    if (!template || template.sessionId !== args.sessionId) {
      throw new Error("Template not found");
    }
    if (template.status === "deleting") {
      throw new Error("Template is being deleted");
    }
    await ctx.db.patch(template._id, {
      name: args.name,
      sourceHash: args.sourceHash,
      engineVersion: args.engineVersion,
      manifestJson: args.manifestJson,
      jsonSchemaJson: args.jsonSchemaJson,
      starterDataJson: args.starterDataJson,
      status: args.status,
      diagnosticsSummary: args.diagnosticsSummary,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getOriginalFileUrl = query({
  args: { ...SessionIdArg, templateId: v.id("templates") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId);
    const template = await ctx.db.get(args.templateId);
    if (
      !template ||
      template.sessionId !== args.sessionId ||
      template.status === "deleting" ||
      !template.originalFileStorageId
    ) {
      return null;
    }
    return await getBearerUrl(ctx, template.originalFileStorageId);
  },
});

export const remove = mutation({
  args: { ...SessionIdArg, templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSessionId(args.sessionId);
    const template = await ctx.db.get(args.templateId);
    if (!template || template.sessionId !== args.sessionId) {
      throw new Error("Template not found");
    }
    if (template.status !== "deleting") {
      await ctx.db.patch(template._id, {
        status: "deleting",
        updatedAt: Date.now(),
      });
    }
    await ctx.scheduler.runAfter(0, internal.templates.deleteTemplateBatch, {
      sessionId: args.sessionId,
      templateId: args.templateId,
    });
    return null;
  },
});

export const deleteTemplateBatch = internalMutation({
  args: { ...SessionIdArg, templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertSessionId(args.sessionId);
    const template = await ctx.db.get(args.templateId);
    if (
      !template ||
      template.sessionId !== args.sessionId ||
      template.status !== "deleting"
    ) {
      return null;
    }
    const renders = await ctx.db
      .query("renders")
      .withIndex("by_sessionId_and_templateId_and_createdAt", (q) =>
        q
          .eq("sessionId", args.sessionId)
          .eq("templateId", args.templateId),
      )
      .take(25);
    for (const render of renders) {
      if (render.pdfStorageId) {
        await deleteStoredFile(ctx, render.pdfStorageId);
      }
      await ctx.db.delete(render._id);
    }
    if (renders.length > 0) {
      await ctx.scheduler.runAfter(0, internal.templates.deleteTemplateBatch, {
        sessionId: args.sessionId,
        templateId: args.templateId,
      });
      return null;
    }
    if (template.originalFileStorageId) {
      await deleteStoredFile(ctx, template.originalFileStorageId);
    }
    await ctx.db.delete(template._id);
    return null;
  },
});
