import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { GenericDataModel, Id } from "convex/values";

type StorageQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "storage">;
type StorageMutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "storage">;

export async function createUploadUrl(ctx: StorageMutationCtx): Promise<string> {
  return await ctx.storage.generateUploadUrl();
}

export async function getBearerUrl(
  ctx: StorageQueryCtx,
  storageId: Id<"_storage">,
): Promise<string | null> {
  return await ctx.storage.getUrl(storageId);
}

export async function deleteStoredFile(
  ctx: StorageMutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  await ctx.storage.delete(storageId);
}
