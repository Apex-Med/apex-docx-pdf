import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { FormBuilder, FormRuntime } from "../src/ui"

describe("forms UI", () => {
  test("exports FormBuilder and FormRuntime", () => {
    expect(FormBuilder).toBeDefined()
    expect(FormRuntime).toBeDefined()
  })

  test("FormRuntime and inspector use TanStack Form", () => {
    const runtime = readFileSync(
      join(import.meta.dir, "../src/ui/FormRuntime.tsx"),
      "utf8"
    )
    const builder = readFileSync(
      join(import.meta.dir, "../src/ui/FormBuilder.tsx"),
      "utf8"
    )
    expect(runtime).toContain('from "@tanstack/react-form"')
    expect(runtime).toContain("useForm(")
    expect(builder).toContain('from "@tanstack/react-form"')
    expect(builder).toContain("useForm(")
    expect(builder).toContain("onDragOver")
    expect(builder).toContain("dropLocationFromOver")
    expect(builder).not.toContain("setLiveBoard")
    expect(builder).not.toContain("PaletteGhost")
    expect(builder).toContain('variant="outline"')
    expect(builder).toContain("SortableItem")
    expect(builder).toContain("autocomplete")
    expect(builder).toContain("cascader")
    expect(builder).toContain("Question settings")
    expect(builder).toContain("data-apex-form-settings")
    expect(builder).toContain("width: 300")
    expect(builder).toContain("maxWidth: 300")
    expect(builder).toContain("Question type")
    expect(builder).toContain("allowCustomValue")
    expect(builder).toContain("NUMBER_UNIT_OPTIONS")
    expect(builder).toContain("Unit")
    expect(builder).toContain("data-question-selected")
    expect(builder).toContain("DraggingQuestionCard")
    expect(builder).not.toContain('?? "Question"')
    expect(builder).not.toContain("ring-2 ring-primary/20")
    expect(builder).toContain("Show only when")
    expect(builder).toContain("Default answer")
    expect(builder).toContain("Choose default")
    expect(builder).toContain("Specific date")
    expect(builder).toContain(">Today<")
    expect(builder).toContain("Quick date selection")
    expect(builder).toContain("Date range")
    expect(builder).toContain("Accepted types")
    expect(builder).toContain("Max files")
    expect(builder).toContain("Max size (MB)")
    expect(builder).toContain("FileAcceptCombobox")
    expect(builder).toContain('@workspace/ui/components/file-accept-combobox')
    expect(builder).not.toContain("TooltipContent")
    expect(builder).toContain("HoverCardContent")
    expect(builder).toContain("descriptionForKind")
    expect(runtime).toContain("submitLabel")
    expect(runtime).toContain("suffix={question.unit}")
    expect(runtime).toContain("Please specify")
    expect(runtime).toContain('placeholder="Select…"')
    expect(runtime).toContain("allowCustomValue={question.allowOther === true}")
    expect(runtime).toContain("joinMultiSelectValues")
    expect(runtime).toContain("items={[")
    expect(runtime).toContain("FileUpload")
    expect(runtime).toContain('@workspace/ui/components/file-upload')
    expect(builder).toContain("items={")
    const preview = readFileSync(
      join(import.meta.dir, "../src/ui/field-preview.tsx"),
      "utf8"
    )
    expect(preview).toContain("Please specify")
    expect(preview).toContain("Select…")
    expect(preview).toContain("Today")
    expect(preview).toContain("suffix={question.unit}")
    expect(preview).toContain("FileUpload")
    expect(builder).toContain("suffix={node.unit}")
    expect(preview).not.toContain("(question.options ?? [])[0]?.label")
  })
})
