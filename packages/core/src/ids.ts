declare const nodeIdBrand: unique symbol
declare const documentHashBrand: unique symbol

export type NodeId = string & { readonly [nodeIdBrand]: true }
export type DocumentHash = string & { readonly [documentHashBrand]: true }

export function nodeId(value: string): NodeId {
  if (value.length === 0) {
    throw new TypeError("A node ID cannot be empty")
  }

  return value as NodeId
}

export function documentHash(value: string): DocumentHash {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("A document hash must be a lowercase SHA-256 hex digest")
  }

  return value as DocumentHash
}
