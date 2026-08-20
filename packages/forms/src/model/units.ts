export type NumberUnitOption = Readonly<{
  value: string
  label: string
  group: string
  keywords?: string
}>

type UnitSeed = Readonly<{
  value: string
  keywords?: string
}>

type UnitGroupSeed = Readonly<{
  group: string
  units: readonly UnitSeed[]
}>

const UNIT_GROUPS: readonly UnitGroupSeed[] = [
  {
    group: "Length",
    units: [
      { value: "mm", keywords: "millimetre millimeter metric" },
      { value: "cm", keywords: "centimetre centimeter metric" },
      { value: "m", keywords: "metre meter metric" },
      { value: "km", keywords: "kilometre kilometer metric" },
      { value: "μm", keywords: "um micron micrometre micrometer metric" },
      { value: "in", keywords: "inch imperial" },
      { value: "ft", keywords: "foot feet imperial" },
      { value: "yd", keywords: "yard imperial" },
      { value: "mi", keywords: "mile imperial" },
    ],
  },
  {
    group: "Mass",
    units: [
      { value: "ng", keywords: "nanogram metric lab" },
      { value: "µg", keywords: "ug microgram mcg metric" },
      { value: "mg", keywords: "milligram metric" },
      { value: "g", keywords: "gram metric" },
      { value: "kg", keywords: "kilogram metric" },
      { value: "oz", keywords: "ounce imperial" },
      { value: "lb", keywords: "pound lbs imperial" },
      { value: "st", keywords: "stone imperial" },
    ],
  },
  {
    group: "Volume",
    units: [
      { value: "nL", keywords: "nanolitre nanoliter metric lab" },
      { value: "µL", keywords: "uL microlitre microliter metric lab" },
      { value: "mL", keywords: "millilitre milliliter cc metric" },
      { value: "dL", keywords: "decilitre deciliter metric lab" },
      { value: "L", keywords: "litre liter metric" },
      { value: "tsp", keywords: "teaspoon imperial" },
      { value: "tbsp", keywords: "tablespoon imperial" },
      { value: "fl oz", keywords: "fluid ounce imperial us" },
      { value: "cup", keywords: "imperial us" },
      { value: "pt", keywords: "pint imperial" },
      { value: "qt", keywords: "quart imperial" },
      { value: "gal", keywords: "gallon imperial us" },
    ],
  },
  {
    group: "Temperature",
    units: [
      { value: "°C", keywords: "celsius centigrade metric si" },
      { value: "°F", keywords: "fahrenheit imperial us" },
      { value: "K", keywords: "kelvin si" },
    ],
  },
  {
    group: "Time",
    units: [
      { value: "ms", keywords: "millisecond" },
      { value: "s", keywords: "second sec" },
      { value: "min", keywords: "minute" },
      { value: "h", keywords: "hour hr" },
      { value: "d", keywords: "day" },
      { value: "wk", keywords: "week" },
      { value: "mo", keywords: "month" },
      { value: "yr", keywords: "year" },
    ],
  },
  {
    group: "Pressure",
    units: [
      { value: "mmHg", keywords: "millimetre mercury blood pressure gas us" },
      { value: "cmH₂O", keywords: "cmH2O centimetre water ventilation" },
      { value: "Pa", keywords: "pascal si" },
      { value: "kPa", keywords: "kilopascal si blood gas" },
      { value: "mbar", keywords: "millibar" },
      { value: "bar", keywords: "metric" },
      { value: "atm", keywords: "atmosphere" },
      { value: "psi", keywords: "imperial us" },
    ],
  },
  {
    group: "Frequency",
    units: [
      { value: "/min", keywords: "per minute rate" },
      { value: "bpm", keywords: "beats per minute heart rate" },
      { value: "breaths/min", keywords: "respiratory rate rr" },
      { value: "Hz", keywords: "hertz frequency" },
      { value: "rpm", keywords: "revolutions per minute" },
    ],
  },
  {
    group: "Energy",
    units: [
      { value: "cal", keywords: "calorie nutrition" },
      { value: "kcal", keywords: "kilocalorie calorie nutrition" },
      { value: "J", keywords: "joule si" },
      { value: "kJ", keywords: "kilojoule si nutrition" },
    ],
  },
  {
    group: "Dosing",
    units: [
      { value: "mg/kg", keywords: "dose weight" },
      { value: "µg/kg", keywords: "ug/kg mcg/kg dose" },
      { value: "mg/kg/day", keywords: "dose daily" },
      { value: "mg/kg/h", keywords: "mg/kg/hr infusion" },
      { value: "µg/kg/min", keywords: "ug/kg/min mcg/kg/min infusion" },
      { value: "µg/kg/h", keywords: "ug/kg/hr mcg/kg/h infusion" },
      { value: "mL/kg", keywords: "volume dose" },
      { value: "mL/kg/h", keywords: "mL/kg/hr fluid" },
      { value: "mL/h", keywords: "mL/hr infusion rate" },
      { value: "units/kg", keywords: "insulin heparin dose" },
      { value: "IU/kg", keywords: "international units dose" },
      { value: "mEq/kg", keywords: "milliequivalent dose" },
    ],
  },
  {
    group: "Laboratory · SI",
    units: [
      { value: "mol/L", keywords: "molar si concentration" },
      { value: "mmol/L", keywords: "millimole si glucose electrolytes sodium potassium" },
      { value: "µmol/L", keywords: "umol/L micromole si bilirubin creatinine" },
      { value: "nmol/L", keywords: "nanomole si hormones" },
      { value: "pmol/L", keywords: "picomole si hormones insulin" },
      { value: "fmol/L", keywords: "femtomole si" },
      { value: "g/L", keywords: "si protein haemoglobin hemoglobin albumin" },
      { value: "mg/L", keywords: "si crp" },
      { value: "µg/L", keywords: "ug/L si" },
      { value: "ng/L", keywords: "si troponin" },
      { value: "U/L", keywords: "enzyme si alt ast alp ldh" },
      { value: "IU/L", keywords: "international unit si enzyme" },
      { value: "mU/L", keywords: "si" },
      { value: "µU/L", keywords: "uU/L si" },
      { value: "µkat/L", keywords: "ukat/L katal si enzyme" },
      { value: "nkat/L", keywords: "katal si" },
      { value: "mOsm/L", keywords: "osmolarity si" },
      { value: "mOsm/kg", keywords: "osmolality si" },
      { value: "mmol/mol", keywords: "hba1c ifcc si" },
      { value: "mEq/L", keywords: "milliequivalent electrolytes sodium potassium bicarbonate" },
    ],
  },
  {
    group: "Laboratory · US",
    units: [
      { value: "mg/dL", keywords: "us conventional glucose cholesterol creatinine calcium" },
      { value: "g/dL", keywords: "us conventional haemoglobin hemoglobin albumin protein" },
      { value: "µg/dL", keywords: "ug/dL mcg/dL us iron cortisol" },
      { value: "ng/dL", keywords: "us hormones testosterone" },
      { value: "pg/mL", keywords: "us hormones bnp" },
      { value: "ng/mL", keywords: "us troponin psa" },
      { value: "µg/mL", keywords: "ug/mL mcg/mL us drug level" },
      { value: "mg/mL", keywords: "us concentration" },
      { value: "IU/mL", keywords: "us" },
      { value: "mIU/mL", keywords: "us hcg tsh" },
      { value: "µIU/mL", keywords: "uIU/mL us insulin" },
      { value: "U/mL", keywords: "us" },
      { value: "mg/24 h", keywords: "mg/24h urine us" },
      { value: "mmol/24 h", keywords: "mmol/24h urine si" },
      { value: "%", keywords: "percent hba1c hematocrit saturation" },
    ],
  },
  {
    group: "Blood counts",
    units: [
      {
        value: "× 10⁹/L",
        keywords: "x 10^9/L x10^9/L 10^9 si wbc platelets leukocytes",
      },
      {
        value: "× 10¹²/L",
        keywords: "x 10^12/L x10^12/L 10^12 si rbc erythrocytes",
      },
      {
        value: "× 10³/µL",
        keywords: "x 10^3/uL x10^3/uL 10^3/ul us wbc platelets k/uL",
      },
      {
        value: "× 10⁶/µL",
        keywords: "x 10^6/uL x10^6/uL 10^6/ul us rbc m/uL",
      },
      { value: "/µL", keywords: "/uL per microlitre cells us" },
      { value: "/mm³", keywords: "per cubic millimetre cells" },
      { value: "/L", keywords: "per litre cells si" },
      { value: "fL", keywords: "femtolitre mcv" },
      { value: "pg", keywords: "picogram mch" },
      { value: "mm/h", keywords: "mm/hr esr sedimentation" },
    ],
  },
  {
    group: "Other",
    units: [
      { value: "ratio", keywords: "dimensionless inr" },
      { value: "index", keywords: "dimensionless" },
      { value: "score", keywords: "dimensionless" },
      { value: "copies/mL", keywords: "viral load pcr" },
      { value: "log10 copies/mL", keywords: "viral load log" },
      { value: "AU/mL", keywords: "arbitrary units serology" },
      { value: "kIU/L", keywords: "kilo international unit ige" },
      { value: "mL/min", keywords: "gfr clearance" },
      { value: "mL/min/1.73 m²", keywords: "egfr gfr bsa" },
      { value: "sec", keywords: "seconds pt ptt clotting" },
      { value: "INR", keywords: "international normalized ratio" },
    ],
  },
]

export const NUMBER_UNIT_OPTIONS: readonly NumberUnitOption[] = UNIT_GROUPS.flatMap(
  (group) =>
    group.units.map((unit) => ({
      value: unit.value,
      label: unit.value,
      group: group.group,
      ...(unit.keywords ? { keywords: unit.keywords } : {}),
    }))
)

export const NUMBER_UNIT_VALUES = new Set(
  NUMBER_UNIT_OPTIONS.map((unit) => unit.value)
)
