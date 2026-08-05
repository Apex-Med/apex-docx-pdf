import { describe, expect, test } from "bun:test"
import { twips, type LayoutTrace } from "@apex-docx-pdf/core"

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
          kind: "line",
          reason: "wrap",
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
      ],
    }
    expect(serializeLayoutTrace(trace)).toBe(
      '{"pages":[{"pageNumber":1,"pageBounds":{"x":0,"y":0,"width":600,"height":800},"contentBounds":{"x":20,"y":30,"width":560,"height":740}}],"events":[{"pageNumber":1,"sourceNodeId":"b","kind":"line","reason":"wrap"},{"pageNumber":1,"sourceNodeId":"a","kind":"block","bounds":{"x":1,"y":2,"width":3,"height":4}}]}'
    )
  })
})
