import { describe, expect, test } from "bun:test"
import { twips, type LayoutTrace } from "@apexmed/core"

import { serializeLayoutTrace } from "../src"

describe("layout trace serialization", () => {
  test("uses canonical keys and preserves event order", () => {
    const trace: LayoutTrace = {
      pages: [
        {
          pageNumber: 1,
          pageBounds: {
            x: twips(0),
            y: twips(0),
            width: twips(600),
            height: twips(800),
          },
          contentBounds: {
            x: twips(20),
            y: twips(30),
            width: twips(560),
            height: twips(740),
          },
        },
      ],
      events: [
        {
          pageNumber: 1,
          sourceNodeId: "b" as never,
          kind: "glyph-run",
          bounds: {
            x: twips(10),
            y: twips(20),
            width: twips(30),
            height: twips(40),
          },
          baselineY: twips(50),
        },
        {
          pageNumber: 1,
          sourceNodeId: "a" as never,
          kind: "block",
          bounds: {
            x: twips(1),
            y: twips(2),
            width: twips(3),
            height: twips(4),
          },
        },
        {
          pageNumber: 1,
          sourceNodeId: "row" as never,
          kind: "table-row-fragment",
          bounds: {
            x: twips(5),
            y: twips(6),
            width: twips(7),
            height: twips(8),
          },
          fragmentOffset: twips(9),
          rowHeight: twips(17),
          repeatedHeader: true,
          reason: "fragmented",
        },
        {
          pageNumber: 1,
          sourceNodeId: "keep" as never,
          kind: "keep-decision",
          decision: "adjusted",
          reason: "widow-orphan",
        },
      ],
    }
    expect(serializeLayoutTrace(trace)).toBe(
      '{"pages":[{"pageNumber":1,"pageBounds":{"x":0,"y":0,"width":600,"height":800},"contentBounds":{"x":20,"y":30,"width":560,"height":740}}],"events":[{"pageNumber":1,"sourceNodeId":"b","kind":"glyph-run","bounds":{"x":10,"y":20,"width":30,"height":40},"baselineY":50},{"pageNumber":1,"sourceNodeId":"a","kind":"block","bounds":{"x":1,"y":2,"width":3,"height":4}},{"pageNumber":1,"sourceNodeId":"row","kind":"table-row-fragment","bounds":{"x":5,"y":6,"width":7,"height":8},"reason":"fragmented","fragmentOffset":9,"rowHeight":17,"repeatedHeader":true},{"pageNumber":1,"sourceNodeId":"keep","kind":"keep-decision","reason":"widow-orphan","decision":"adjusted"}]}'
    )
  })
})
