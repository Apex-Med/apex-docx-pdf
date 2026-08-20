import { describe, expect, test } from "bun:test"

import {
  isCompleteDateAnswer,
  normalizeStoredDateAnswer,
} from "../src/model/dates"
import { DATE_DEFAULT_TODAY } from "../src/model/types"

describe("date answers", () => {
  test("keeps today as a sentinel", () => {
    expect(
      normalizeStoredDateAnswer(DATE_DEFAULT_TODAY, { dateRange: true })
    ).toBe(DATE_DEFAULT_TODAY)
  })

  test("strips the end date when range is off", () => {
    expect(
      normalizeStoredDateAnswer("2026-08-20/2026-08-27", { dateRange: false })
    ).toBe("2026-08-20")
  })

  test("strips times when includeTime is off", () => {
    expect(
      normalizeStoredDateAnswer("2026-08-20T09:00/2026-08-27T17:30", {
        includeTime: false,
        dateRange: true,
      })
    ).toBe("2026-08-20/2026-08-27")
  })

  test("complete answers require both ends and times", () => {
    expect(
      isCompleteDateAnswer("2026-08-20", { dateRange: true })
    ).toBe(false)
    expect(
      isCompleteDateAnswer("2026-08-20/2026-08-27", { dateRange: true })
    ).toBe(true)
    expect(
      isCompleteDateAnswer("2026-08-20", { includeTime: true })
    ).toBe(false)
    expect(
      isCompleteDateAnswer("2026-08-20T09:00", { includeTime: true })
    ).toBe(true)
  })
})
