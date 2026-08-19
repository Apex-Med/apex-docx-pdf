import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const stylesDirectory = join(import.meta.dir, "../src/styles")
const css = readFileSync(join(stylesDirectory, "editor.css"), "utf8")
const output = `/** Auto-synced from editor.css — inject via ensureEditorStyles(). */\nexport const EDITOR_CSS = ${JSON.stringify(css)}\n`

writeFileSync(join(stylesDirectory, "editor-css.ts"), output)
