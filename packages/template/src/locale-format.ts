export type CanonicalFormatterLocale = "en-US" | "en-ZA"

const NO_FRACTION_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
])

const THREE_FRACTION_CURRENCIES = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
])

const SYMBOLS: Readonly<
  Record<CanonicalFormatterLocale, Readonly<Record<string, string>>>
> = Object.freeze({
  "en-US": Object.freeze({
    CNY: "CN¥",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    USD: "$",
  }),
  "en-ZA": Object.freeze({
    CNY: "CN¥",
    EUR: "€",
    GBP: "£",
    JPY: "JP¥",
    USD: "US$",
    ZAR: "R",
  }),
})

export function canonicalFormatterLocale(
  value: string
): CanonicalFormatterLocale | undefined {
  const normalized = value.trim().replaceAll("_", "-").toLowerCase()
  if (normalized === "en-us" || normalized.startsWith("en-us-u-"))
    return "en-US"
  if (normalized === "en-za" || normalized.startsWith("en-za-u-"))
    return "en-ZA"
  return undefined
}

export function formatCanonicalCurrency(
  value: number,
  currency: string,
  locale: CanonicalFormatterLocale
): string | undefined {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    return undefined

  const fractionDigits = NO_FRACTION_CURRENCIES.has(currency)
    ? 0
    : THREE_FRACTION_CURRENCIES.has(currency)
      ? 3
      : 2
  const [whole = "0", fraction] = Math.abs(value)
    .toFixed(fractionDigits)
    .split(".")
  const groupSeparator = locale === "en-ZA" ? "\u00a0" : ","
  const decimalSeparator = locale === "en-ZA" ? "," : "."
  const grouped = whole.replace(/\B(?=(?:\d{3})+(?!\d))/gu, groupSeparator)
  const amount =
    fraction === undefined
      ? grouped
      : `${grouped}${decimalSeparator}${fraction}`
  const symbol = SYMBOLS[locale][currency]
  const label = symbol ?? currency
  const labelSeparator =
    symbol === undefined || locale === "en-ZA" ? "\u00a0" : ""
  const sign = value < 0 || Object.is(value, -0) ? "-" : ""
  return `${sign}${label}${labelSeparator}${amount}`
}
