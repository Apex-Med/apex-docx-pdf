import { describe, expect, test } from "bun:test"

import {
  emptyPlaygroundTemplateMetadata,
  initialPlaygroundRenderRevision,
  invalidatePlaygroundRender,
  isPlaygroundRenderCurrent,
  isPlaygroundRenderedDataCurrent,
} from "../src/lib/playground-freshness"

describe("playground render freshness", () => {
  test("invalidates a render captured before a data edit", () => {
    const renderedRevision = initialPlaygroundRenderRevision
    const editedRevision = invalidatePlaygroundRender(renderedRevision)

    expect(isPlaygroundRenderCurrent(editedRevision, renderedRevision)).toBe(
      false
    )
    expect(isPlaygroundRenderCurrent(editedRevision, editedRevision)).toBe(true)
  })

  test("every edit advances freshness, including edits during a render", () => {
    const renderA = initialPlaygroundRenderRevision
    const dataB = invalidatePlaygroundRender(renderA)
    const dataC = invalidatePlaygroundRender(dataB)

    expect(dataC).toBe(2)
    expect(isPlaygroundRenderCurrent(dataC, renderA)).toBe(false)
    expect(isPlaygroundRenderCurrent(dataC, dataB)).toBe(false)
  })

  test("persistence accepts only data matching the rendered PDF snapshot", () => {
    const renderedData = { invoice: { number: "A", lines: [1, 2] } }

    expect(
      isPlaygroundRenderedDataCurrent(renderedData, {
        invoice: { lines: [1, 2], number: "A" },
      })
    ).toBe(true)
    expect(
      isPlaygroundRenderedDataCurrent(renderedData, {
        invoice: { number: "B", lines: [1, 2] },
      })
    ).toBe(false)
  })

  test("cancelled template metadata cannot retain a filename or size", () => {
    expect(emptyPlaygroundTemplateMetadata()).toEqual({})
    expect(emptyPlaygroundTemplateMetadata().fileName).toBeUndefined()
    expect(emptyPlaygroundTemplateMetadata().fileSize).toBeUndefined()
  })
})
