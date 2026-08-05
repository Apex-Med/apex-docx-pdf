import { XMLParser } from "../packages/docx/node_modules/fast-xml-parser"
import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
} from "../packages/docx/node_modules/fflate"

const mapping = new Map<string, string>([
  ["ward_description", "ward.description:string"],
  ["ward.name", "ward.name:string"],
  ["patient.full_name", "patient.fullName:string"],
  ["patient.date_of_birth", "patient.dateOfBirth:string"],
  ["patient.folder_no", "patient.folderNumber:string"],
  ["patient.gender", "patient.gender:string"],
  ["patient.hometown", "patient.hometown:string"],
  ["Referred from", "patient.referredFrom:string"],
  ["Admission date", "encounter.admissionDate:string"],
  ["Discharge date", "encounter.dischargeDate:string"],
  ["Admitting doctor initials", "encounter.admittingDoctor.initials:string"],
  ["Admitting doctor last name", "encounter.admittingDoctor.lastName:string"],
  [
    "Admitting doctor registration no",
    "encounter.admittingDoctor.registrationNumber:string",
  ],
  ["calc.age_at_admission", "patient.ageAtAdmissionDays:number"],
  ["HIV status", "patient.hiv.status:string"],
  ["HIV Confirmation status", "patient.hiv.confirmationStatus:string"],
  ["HIV confirmation status date", "patient.hiv.confirmationDate:string"],
  ["Mode of delivery", "birth.modeOfDelivery:string"],
  ["Gestational age", "birth.gestationalAgeWeeks:number"],
  ["Apgar at 1 min", "birth.apgarOneMinute:number"],
  ["Apgar at 5 min", "birth.apgarFiveMinutes:number"],
  ["Birth weight", "birth.weightGrams:number"],
  ["Current problems", "summary.currentProblems:string"],
  ["Maternal first names", "mother.firstNames:string"],
  ["Maternal last name", "mother.lastName:string"],
  ["Maternal date of birth", "mother.dateOfBirth:string"],
  ["Maternal folder no", "mother.folderNumber:string"],
  ["Maternal age", "mother.ageYears:number"],
  ["G", "mother.obstetricHistory.gravida:number"],
  ["P", "mother.obstetricHistory.para:number"],
  ["M", "mother.obstetricHistory.miscarriages:number"],
  ["TOP", "mother.obstetricHistory.terminations:number"],
  ["Maternal comorbidities", "mother.comorbidities:string"],
  ["Maternal HIV status", "mother.hiv.status:string"],
  [
    "Maternal HIV status confirmation date",
    "mother.hiv.confirmationDate:string",
  ],
  ["Maternal Rh status", "mother.rhStatus:string"],
  ["Maternal RPR status", "mother.rprStatus:string"],
  ["Maternal HepBsAg status", "mother.hepatitisBStatus:string"],
  ["Maternal alcohol use", "mother.alcoholUse:string"],
  ["Maternal smoking", "mother.smoking:string"],
  ["Date of birth", "patient.dateOfBirth:string"],
  ["Place of birth", "birth.place:string"],
  ["Delivery complications", "birth.deliveryComplications:string"],
  ["Birth length", "birth.lengthCentimetres:number"],
  ["Head circumference", "birth.headCircumferenceCentimetres:number"],
  ["Birth resuscitation", "birth.resuscitation:string"],
  ["Heart rate", "admission.vitals.heartRateBpm:number"],
  ["Respiratory rate", "admission.vitals.respiratoryRatePerMinute:number"],
  ["Sats on room air", "admission.vitals.oxygenSaturationPercent:number"],
  ["Temperature", "admission.vitals.temperatureCelsius:number"],
  ["HGT", "admission.vitals.glucoseMmolPerLitre:number"],
  ["General", "admission.examination.general:string"],
  ["Dysmorphology", "admission.examination.dysmorphology:string"],
  ["Respiratory", "admission.examination.respiratory:string"],
  ["Cardiovascular", "admission.examination.cardiovascular:string"],
  ["Abdominal", "admission.examination.abdominal:string"],
  ["Neurological", "admission.examination.neurological:string"],
  ["Genitourinary", "admission.examination.genitourinary:string"],
  ["Spine", "admission.examination.spine:string"],
  ["Palate", "admission.examination.palate:string"],
  ["k-result", "laboratory.potassium:string"],
  ["na-result", "laboratory.sodium:string"],
  ["modality", "modality:string"],
  ["results", "results:string"],
  ["Oxygen requirements", "course.oxygenRequirements:string"],
  ["Antibiotics", "course.antibiotics:string"],
  ["Fluids & feeds", "course.fluidsAndFeeds:string"],
  ["Complications in the ward", "course.complications:string"],
  ["calc.age_at_discharge", "patient.ageAtDischargeDays:number"],
  ["Weight at discharge", "discharge.weightGrams:number"],
  ["Difference from BW", "discharge.birthWeightDifferenceGrams:number"],
  ["Clinical condition at discharge", "discharge.clinicalCondition:string"],
  ["Feeds at discharge", "discharge.feeds:string"],
  ["Discharge plan", "discharge.plan:string"],
  ["Follow-up plan", "discharge.followUpPlan:string"],
  ["TTO", "discharge.takeHomeMedication:string"],
  [
    "Discharging doctor initials",
    "encounter.dischargingDoctor.initials:string",
  ],
  [
    "Discharging doctor last name",
    "encounter.dischargingDoctor.lastName:string",
  ],
  [
    "Discharging doctor qualifications",
    "encounter.dischargingDoctor.qualifications:string",
  ],
  [
    "Discharging doctor registration no",
    "encounter.dischargingDoctor.registrationNumber:string",
  ],
  ["Consultant in charge initials", "encounter.consultant.initials:string"],
  ["Consultant in charge last name", "encounter.consultant.lastName:string"],
  [
    "Consultant in charge qualifications",
    "encounter.consultant.qualifications:string",
  ],
  [
    "Consultant in charge registration no",
    "encounter.consultant.registrationNumber:string",
  ],
  ["department.name", "department.name:string"],
  ["facility.name", "facility.name:string"],
  ["facility.address", "facility.address:string"],
  ["facility.phone", "facility.phone:string"],
])

const sampleData = {
  ward: { description: "Neonatal ward", name: "K3" },
  patient: {
    fullName: "Baby Example",
    dateOfBirth: "1 August 2026",
    folderNumber: "SYN-0001",
    gender: "Female",
    hometown: "Johannesburg",
    referredFrom: "Synthetic referral facility",
    ageAtAdmissionDays: 1,
    ageAtDischargeDays: 8,
    hiv: {
      status: "Exposed",
      confirmationStatus: "Pending",
      confirmationDate: "Not yet confirmed",
    },
  },
  encounter: {
    admissionDate: "2 August 2026",
    dischargeDate: "9 August 2026",
    admittingDoctor: {
      initials: "A.",
      lastName: "Example",
      registrationNumber: "SYN-ADMIT-001",
    },
    dischargingDoctor: {
      initials: "D.",
      lastName: "Example",
      qualifications: "MBChB",
      registrationNumber: "SYN-DISCHARGE-001",
    },
    consultant: {
      initials: "C.",
      lastName: "Example",
      qualifications: "FCPaed",
      registrationNumber: "SYN-CONSULT-001",
    },
  },
  summary: { currentProblems: "Feeding established; clinically stable." },
  mother: {
    firstNames: "Synthetic",
    lastName: "Parent",
    dateOfBirth: "1 January 1996",
    folderNumber: "SYN-MAT-0001",
    ageYears: 30,
    obstetricHistory: {
      gravida: 2,
      para: 2,
      miscarriages: 0,
      terminations: 0,
    },
    comorbidities: "None documented",
    hiv: { status: "Negative", confirmationDate: "1 March 2026" },
    rhStatus: "Positive",
    rprStatus: "Non-reactive",
    hepatitisBStatus: "Negative",
    alcoholUse: "None",
    smoking: "None",
  },
  birth: {
    modeOfDelivery: "Vaginal delivery",
    gestationalAgeWeeks: 38,
    apgarOneMinute: 8,
    apgarFiveMinutes: 9,
    weightGrams: 3150,
    place: "Synthetic facility",
    deliveryComplications: "None",
    lengthCentimetres: 49,
    headCircumferenceCentimetres: 34,
    resuscitation: "Routine care",
  },
  admission: {
    vitals: {
      heartRateBpm: 142,
      respiratoryRatePerMinute: 42,
      oxygenSaturationPercent: 98,
      temperatureCelsius: 36.8,
      glucoseMmolPerLitre: 4.6,
    },
    examination: {
      general: "Alert and well perfused",
      dysmorphology: "No dysmorphic features noted",
      respiratory: "Clear breath sounds bilaterally",
      cardiovascular: "Normal heart sounds; good pulses",
      abdominal: "Soft; no organomegaly",
      neurological: "Normal tone and reflexes",
      genitourinary: "Normal external examination",
      spine: "Intact",
      palate: "Intact",
    },
  },
  laboratory: {
    date: "4 August 2026",
    potassium: "4.3 mmol/L",
    sodium: "139 mmol/L",
  },
  investigations: [
    {
      date: "5 August 2026",
      modality: "Chest radiograph",
      results: "No acute abnormality.",
    },
    {
      date: "6 August 2026",
      modality: "Cranial ultrasound",
      results: "Normal study.",
    },
  ],
  course: {
    oxygenRequirements: "Room air throughout admission",
    antibiotics: "None",
    fluidsAndFeeds: "Full oral feeds established",
    complications: "None",
  },
  discharge: {
    weightGrams: 3220,
    birthWeightDifferenceGrams: 70,
    clinicalCondition: "Clinically stable",
    feeds: "Breastfeeding on demand",
    plan: "Routine newborn care and safety-net advice",
    followUpPlan: "Clinic review in seven days",
    takeHomeMedication: "Vitamin D as directed",
  },
  department: { name: "Paediatrics" },
  facility: {
    name: "Synthetic Academic Hospital",
    address: "1 Example Road, Johannesburg",
    phone: "+27 00 000 0000",
  },
} as const

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function replaceFirst(source: string, from: string, to: string): string {
  const index = source.indexOf(from)
  if (index < 0) throw new Error(`Expected placeholder ${from} was not found`)
  return source.slice(0, index) + to + source.slice(index + from.length)
}

function insertInvestigationLoop(documentXml: string): string {
  const dateToken = escapeXmlText("{{date}}")
  const contentToken = escapeXmlText("{{modality}}")
  const closeToken = escapeXmlText("{{/each}}")
  const firstDateIndex = documentXml.indexOf(dateToken)
  const loopDateIndex = documentXml.indexOf(dateToken, firstDateIndex + 1)
  const contentIndex = documentXml.indexOf(contentToken)
  const closeIndex = documentXml.indexOf(closeToken)
  if (loopDateIndex < 0 || contentIndex < 0 || closeIndex < 0) {
    throw new Error(
      "The expected investigation date, content, and closing rows are missing"
    )
  }
  const rowStartBefore = (index: number): number =>
    Math.max(
      documentXml.lastIndexOf("<w:tr>", index),
      documentXml.lastIndexOf("<w:tr ", index)
    )
  const loopRowStart = rowStartBefore(loopDateIndex)
  const closeRowStart = rowStartBefore(closeIndex)
  const closeRowEnd = documentXml.indexOf("</w:tr>", closeIndex)
  if (loopRowStart < 0 || closeRowStart < 0 || closeRowEnd < 0) {
    throw new Error("The investigation loop rows could not be located")
  }
  const closeRow = documentXml.slice(closeRowStart, closeRowEnd + 7)
  const openRow = replaceFirst(
    closeRow,
    closeToken,
    escapeXmlText("{{#each investigations}}")
  )
  return (
    documentXml.slice(0, loopRowStart) +
    openRow +
    documentXml.slice(loopRowStart)
  )
}

function migratePlaceholders(originalXml: string): string {
  let migrated = insertInvestigationLoop(originalXml)
  migrated = replaceFirst(
    migrated,
    escapeXmlText("{{date}}"),
    escapeXmlText("{{laboratory.date:string}}")
  )
  migrated = replaceFirst(
    migrated,
    escapeXmlText("{{date}}"),
    escapeXmlText("{{date:string}}")
  )

  for (const [legacy, replacement] of mapping) {
    const from = escapeXmlText(`{{${legacy}}}`)
    const to = escapeXmlText(`{{${replacement}}}`)
    if (!migrated.includes(from)) {
      throw new Error(`Expected placeholder {{${legacy}}} was not found`)
    }
    migrated = migrated.replaceAll(from, to)
  }

  const remaining = [
    ...migrated.matchAll(/\{\{(?!#each |\/each)[^{}]+\}\}/gu),
  ].map((match) => match[0])
  const invalid = remaining.filter(
    (token) =>
      !/^\{\{[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*:(?:string|number|boolean|date)\}\}$/u.test(
        token
      )
  )
  if (invalid.length > 0) {
    throw new Error(`Invalid migrated placeholders: ${invalid.join(", ")}`)
  }
  if (
    !migrated.includes(escapeXmlText("{{#each investigations}}")) ||
    !migrated.includes(escapeXmlText("{{/each}}"))
  ) {
    throw new Error("The investigation row loop is not balanced")
  }
  return migrated
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  return left.every((byte, index) => byte === right[index])
}

const [, , inputPath, outputPath, samplePath] = Bun.argv
if (!inputPath || !outputPath || !samplePath) {
  throw new Error(
    "Usage: bun scripts/prepare-k3-template.ts <input.docx> <output.docx> <sample.json>"
  )
}

const sourceBytes = new Uint8Array(await Bun.file(inputPath).arrayBuffer())
const sourceParts = unzipSync(sourceBytes)
const documentPart = sourceParts["word/document.xml"]
if (!documentPart) throw new Error("word/document.xml is missing")

const migratedXml = migratePlaceholders(strFromU8(documentPart))
new XMLParser({ ignoreAttributes: false }).parse(migratedXml)

const outputParts: Record<string, Uint8Array> = {}
for (const [name, bytes] of Object.entries(sourceParts)) {
  outputParts[name] =
    name === "word/document.xml" ? strToU8(migratedXml) : bytes
}
const outputBytes = zipSync(outputParts, { level: 6 })
const verifiedParts = unzipSync(outputBytes)

const changedParts: string[] = []
for (const [name, bytes] of Object.entries(sourceParts)) {
  const output = verifiedParts[name]
  if (!output || !equalBytes(bytes, output)) changedParts.push(name)
}
if (changedParts.length !== 1 || changedParts[0] !== "word/document.xml") {
  throw new Error(
    `Unexpected changed package parts: ${changedParts.join(", ")}`
  )
}

await Bun.write(outputPath, outputBytes)
await Bun.write(samplePath, `${JSON.stringify(sampleData, null, 2)}\n`)

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      samplePath,
      inputBytes: sourceBytes.length,
      outputBytes: outputBytes.length,
      packageParts: Object.keys(sourceParts).length,
      changedParts,
      migratedLegacyFields: mapping.size + 2,
      insertedLoops: ["investigations"],
      preservedByteIdenticalParts: Object.keys(sourceParts).length - 1,
    },
    null,
    2
  )
)
