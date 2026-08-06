import { describe, expect, test } from "bun:test"

import {
  dateFieldFormats,
  dateFieldInputPrecision,
  fieldValidationMessages,
  inspectImageBytes,
  parseFiniteNumberInput,
  playgroundDateInputToIso,
  playgroundDateInputValue,
  readPlaygroundImage,
  validateTemplateData,
} from "../src/lib/playground-data"

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    patient: {
      type: "object",
      properties: {
        name: { type: "string" },
        seenAt: { type: "string", format: "date-time" },
      },
      required: ["name", "seenAt"],
      additionalProperties: false,
    },
  },
  required: ["patient"],
  additionalProperties: false,
} as const

describe("validateTemplateData", () => {
  test("validates against the supplied compiled schema", () => {
    expect(
      validateTemplateData(schema, {
        patient: { name: "Ada", seenAt: "2026-08-05T00:00:00.000Z" },
      })
    ).toEqual({ ok: true, issues: [] })
  })

  test("reports useful instance paths for nested failures", () => {
    const result = validateTemplateData(schema, {
      patient: { seenAt: "not-a-date" },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain(
        "/patient/name must have required property 'name'"
      )
      expect(
        result.errors.some((error) => error.startsWith("/patient/seenAt "))
      ).toBe(true)
      expect(result.issues).toContainEqual({
        path: "patient.name",
        message: "must have required property 'name'",
      })
    }
  })

  test("maps nested array and image-property failures to generated controls", () => {
    const nestedSchema = {
      type: "object",
      properties: {
        patients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              photo: {
                type: "object",
                properties: { width: { type: "integer", minimum: 1 } },
                required: ["width"],
              },
            },
            required: ["photo"],
          },
        },
      },
      required: ["patients"],
    } as const
    const result = validateTemplateData(nestedSchema, {
      patients: [{ photo: { width: 0 } }, {}],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual([
        "patients[0].photo.width",
        "patients[1].photo",
      ])
      expect(
        fieldValidationMessages(result.issues, "patients[0].photo", true)
      ).toEqual(["must be >= 1"])
      expect(
        fieldValidationMessages(result.issues, "patients[1].photo", true)
      ).toEqual(["must have required property 'photo'"])
      expect(
        fieldValidationMessages(result.issues, "patients[0].photo")
      ).toEqual([])
    }
  })

  test("accepts finite number input without producing NaN", () => {
    expect(parseFiniteNumberInput("42.5")).toBe(42.5)
    expect(parseFiniteNumberInput("")).toBe(0)
    expect(parseFiniteNumberInput("not-a-number")).toBeUndefined()
    expect(parseFiniteNumberInput("Infinity")).toBeUndefined()
  })
})

describe("playground date inputs", () => {
  test("derives date, minute, and second precision from manifest formats", () => {
    const field = (formats: readonly string[]) => ({
      path: "appointment.startsAt",
      kind: "date" as const,
      required: true,
      formatters: formats.map((format) => ({
        name: "date",
        arguments: [format],
      })),
      sourceLocations: [],
      inferredFrom: [],
    })

    expect(dateFieldFormats(field(["dd-MM-yyyy"]))).toEqual(["dd-MM-yyyy"])
    expect(dateFieldInputPrecision(field(["dd-MM-yyyy"]))).toBe("date")
    expect(dateFieldInputPrecision(field(["dd-MM-yyyy HH:mm"]))).toBe("minute")
    expect(
      dateFieldInputPrecision(field(["dd-MM-yyyy", "dd-MM-yyyy hh:mm:ss a"]))
    ).toBe("second")
  })

  test("round-trips wall-clock inputs through the explicit playground time zone", () => {
    expect(
      playgroundDateInputValue(
        "2026-08-05T07:30:15.000Z",
        "second",
        "Africa/Johannesburg"
      )
    ).toBe("2026-08-05T09:30:15")
    expect(
      playgroundDateInputToIso(
        "2026-08-05T09:30",
        "minute",
        "Africa/Johannesburg"
      )
    ).toBe("2026-08-05T09:30:00.000+02:00")
    expect(
      playgroundDateInputToIso("2026-08-05", "date", "Africa/Johannesburg")
    ).toBe("2026-08-05T00:00:00.000+02:00")
    expect(
      playgroundDateInputToIso("2026-02-30", "date", "Africa/Johannesburg")
    ).toBeUndefined()
  })
})

describe("playground image helpers", () => {
  test("reads PNG dimensions and creates JSON-representable bytes", async () => {
    const bytes = new Uint8Array(24)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(bytes.buffer)
    view.setUint32(16, 600)
    view.setUint32(20, 300)

    expect(inspectImageBytes(bytes)).toEqual({
      mimeType: "image/png",
      pixelWidth: 600,
      pixelHeight: 300,
    })
    const value = await readPlaygroundImage({
      name: "patient-photo.png",
      type: "image/png",
      arrayBuffer: async () => bytes.buffer,
    })
    expect(value.bytes).toEqual(Array.from(bytes))
    expect(value.width).toBe(2_880)
    expect(value.height).toBe(1_440)
    expect(value.altText).toBe("patient-photo")
  })

  test("reads JPEG SOF dimensions and rejects unsupported bytes", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ])
    expect(inspectImageBytes(jpeg)).toEqual({
      mimeType: "image/jpeg",
      pixelWidth: 64,
      pixelHeight: 32,
    })
    expect(() => inspectImageBytes(Uint8Array.of(1, 2, 3))).toThrow(
      "Choose a PNG or JPEG"
    )
  })
})
