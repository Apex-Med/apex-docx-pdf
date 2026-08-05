import { describe, expect, test } from "bun:test"

import {
  bytesEqual,
  bytesToHex,
  concatBytes,
  hexToBytes,
  sha256Hex,
} from "../src"

describe("byte helpers", () => {
  test("converts and compares bytes", () => {
    const bytes = concatBytes([Uint8Array.of(0, 15), Uint8Array.of(255)])
    expect(bytesToHex(bytes)).toBe("000fff")
    expect(hexToBytes("000fFf")).toEqual(bytes)
    expect(bytesEqual(bytes, Uint8Array.of(0, 15, 255))).toBe(true)
    expect(bytesEqual(bytes, Uint8Array.of(0, 15))).toBe(false)
    expect(() => hexToBytes("abc")).toThrow()
  })

  test("hashes with Web Crypto", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"))
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})
