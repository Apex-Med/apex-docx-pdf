import { SessionIdArg } from "convex-helpers/server/sessions"
import { v } from "convex/values"
import { mutation } from "./_generated/server"
import { createUploadUrl } from "./storageAccess"
import { assertSessionId } from "./validation"

export const generateUploadUrl = mutation({
  args: {
    ...SessionIdArg,
    kind: v.union(v.literal("docx"), v.literal("pdf")),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    assertSessionId(args.sessionId)
    return await createUploadUrl(ctx)
  },
})
