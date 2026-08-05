import { describe, expect, test } from "bun:test"

import {
  canonicalJson,
  computeRenderCacheIdentity,
  sha256Hex,
} from "../src/lib/render-cache"

describe("render cache identity", () => {
  test("canonicalizes object keys while preserving array order", () => {
    const first = { z: 1, nested: { b: true, a: null }, rows: ["a", "b"] }
    const reordered = {
      rows: ["a", "b"],
      nested: { a: null, b: true },
      z: 1,
    }

    expect(canonicalJson(first)).toBe(canonicalJson(reordered))
    expect(canonicalJson(first)).toBe(
      '{"nested":{"a":null,"b":true},"rows":["a","b"],"z":1}'
    )
    expect(canonicalJson(["a", "b"])).not.toBe(canonicalJson(["b", "a"]))
  })

  test("produces deterministic hashes and changes keys when ordered data changes", async () => {
    const base = {
      engineVersion: "engine:1",
      templateHash: "template:abc",
      fontRegistryHash: "fonts:def",
      data: { invoice: { amount: 42, tags: ["one", "two"] } },
      renderOptions: { pdfa: false, locale: "en-ZA" },
    }
    const reordered = {
      ...base,
      data: { invoice: { tags: ["one", "two"], amount: 42 } },
      renderOptions: { locale: "en-ZA", pdfa: false },
    }
    const changedOrder = {
      ...base,
      data: { invoice: { amount: 42, tags: ["two", "one"] } },
    }

    const first = await computeRenderCacheIdentity(base)
    expect(await computeRenderCacheIdentity(reordered)).toEqual(first)
    expect((await computeRenderCacheIdentity(changedOrder)).cacheKey).not.toBe(
      first.cacheKey
    )
    expect(first.cacheKey).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.dataHash).toBe(await sha256Hex(canonicalJson(base.data)))
  })

  test("frames cache-key inputs without concatenation collisions", async () => {
    const common = {
      templateHash: "template",
      fontRegistryHash: "fonts",
      data: {},
      renderOptions: {},
    }
    const first = await computeRenderCacheIdentity({
      ...common,
      engineVersion: "a",
      templateHash: "bc",
    })
    const second = await computeRenderCacheIdentity({
      ...common,
      engineVersion: "ab",
      templateHash: "c",
    })

    expect(first.cacheKey).not.toBe(second.cacheKey)
  })

  test("rejects unsupported and cyclic values", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const sparse: unknown[] = []
    sparse.length = 2
    sparse[1] = "value"

    for (const value of [
      undefined,
      () => undefined,
      Symbol("value"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      { missing: undefined },
      cyclic,
      new Date(0),
    ]) {
      expect(() => canonicalJson(value)).toThrow()
    }
    expect(() => canonicalJson(sparse)).toThrow()
  })
})
