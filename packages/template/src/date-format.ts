export const DEFAULT_DATE_FORMAT = "dd-MM-yyyy"

const ENGLISH_MONTHS = Object.freeze({
  short: Object.freeze([
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]),
  long: Object.freeze([
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]),
})

const FORMAT_PART =
  /(yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|a|[\s\-/:.,]+)/gy

type DateTimeToken =
  | "yyyy"
  | "yy"
  | "MMMM"
  | "MMM"
  | "MM"
  | "M"
  | "dd"
  | "d"
  | "HH"
  | "H"
  | "hh"
  | "h"
  | "mm"
  | "m"
  | "ss"
  | "s"
  | "a"

type PatternPart =
  | Readonly<{ type: "token"; value: DateTimeToken }>
  | Readonly<{ type: "literal"; value: string }>

export type ParsedDateTimeFormat = Readonly<{
  parts: readonly PatternPart[]
  includesTime: boolean
}>

export function parseDateTimeFormat(
  pattern: string
): ParsedDateTimeFormat | undefined {
  if (pattern.length === 0 || pattern.length > 64) return undefined

  const parts: PatternPart[] = []
  FORMAT_PART.lastIndex = 0
  while (FORMAT_PART.lastIndex < pattern.length) {
    const match = FORMAT_PART.exec(pattern)
    if (match === null) return undefined
    const value = match[0]
    parts.push(
      /^[\s\-/:.,]+$/u.test(value)
        ? { type: "literal", value }
        : { type: "token", value: value as DateTimeToken }
    )
  }

  const tokens = parts
    .filter(
      (part): part is Extract<PatternPart, { type: "token" }> =>
        part.type === "token"
    )
    .map((part) => part.value)
  const year = tokens.filter((token) => token === "yyyy" || token === "yy")
  const month = tokens.filter((token) =>
    ["MMMM", "MMM", "MM", "M"].includes(token)
  )
  const day = tokens.filter((token) => token === "dd" || token === "d")
  const hour24 = tokens.filter((token) => token === "HH" || token === "H")
  const hour12 = tokens.filter((token) => token === "hh" || token === "h")
  const minute = tokens.filter((token) => token === "mm" || token === "m")
  const second = tokens.filter((token) => token === "ss" || token === "s")
  const dayPeriod = tokens.filter((token) => token === "a")
  const includesTime =
    hour24.length +
      hour12.length +
      minute.length +
      second.length +
      dayPeriod.length >
    0

  if (
    year.length !== 1 ||
    month.length !== 1 ||
    day.length !== 1 ||
    hour24.length > 1 ||
    hour12.length > 1 ||
    minute.length > 1 ||
    second.length > 1 ||
    dayPeriod.length > 1 ||
    hour24.length + hour12.length > 1 ||
    (includesTime && hour24.length + hour12.length !== 1) ||
    (second.length === 1 && minute.length !== 1) ||
    (hour12.length === 1 && dayPeriod.length !== 1) ||
    (hour24.length === 1 && dayPeriod.length !== 0)
  ) {
    return undefined
  }

  return { parts, includesTime }
}

export function formatDateTime(
  date: Date,
  pattern: ParsedDateTimeFormat,
  timeZone: string
): string {
  const numericParts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const numericPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(numericParts.find((part) => part.type === type)?.value ?? "0")
  const numeric = (value: number, minimumIntegerDigits = 1): string =>
    String(value).padStart(minimumIntegerDigits, "0")
  const year = numericPart("year")
  const month = numericPart("month")
  const day = numericPart("day")
  const hour24 = numericPart("hour")
  const minute = numericPart("minute")
  const second = numericPart("second")
  const hour12 = hour24 % 12 || 12

  return pattern.parts
    .map((part) => {
      if (part.type === "literal") return part.value
      switch (part.value) {
        case "yyyy":
          return numeric(year, 4)
        case "yy":
          return numeric(year % 100, 2)
        case "MMMM":
          return ENGLISH_MONTHS.long[month - 1] ?? ""
        case "MMM":
          return ENGLISH_MONTHS.short[month - 1] ?? ""
        case "MM":
          return numeric(month, 2)
        case "M":
          return numeric(month)
        case "dd":
          return numeric(day, 2)
        case "d":
          return numeric(day)
        case "HH":
          return numeric(hour24, 2)
        case "H":
          return numeric(hour24)
        case "hh":
          return numeric(hour12, 2)
        case "h":
          return numeric(hour12)
        case "mm":
          return numeric(minute, 2)
        case "m":
          return numeric(minute)
        case "ss":
          return numeric(second, 2)
        case "s":
          return numeric(second)
        case "a":
          return hour24 < 12 ? "AM" : "PM"
      }
      return ""
    })
    .join("")
}
