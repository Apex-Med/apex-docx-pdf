import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server"
import type { GenericId } from "convex/values"

type StorageQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "storage">
type StorageMutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "storage">

export async function createUploadUrl(
  ctx: StorageMutationCtx
): Promise<string> {
  return await ctx.storage.generateUploadUrl()
}

export async function getBearerUrl(
  ctx: StorageQueryCtx,
  storageId: GenericId<"_storage">
): Promise<string | null> {
  return await ctx.storage.getUrl(storageId)
}

export async function deleteStoredFile(
  ctx: StorageMutationCtx,
  storageId: GenericId<"_storage">
): Promise<void> {
  await ctx.storage.delete(storageId)
}
