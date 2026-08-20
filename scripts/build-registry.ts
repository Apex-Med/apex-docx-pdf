import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

type RegistryFile = Readonly<{
  path: string
  type: string
}>

type RegistryItem = Readonly<{
  name: string
  type: string
  title: string
  description: string
  dependencies?: readonly string[]
  registryDependencies?: readonly string[]
  files: readonly RegistryFile[]
}>

type Registry = Readonly<{
  name: string
  homepage: string
  items: readonly RegistryItem[]
}>

const registry = JSON.parse(await readFile("registry.json", "utf8")) as Registry
const outputDirectory = "registry"

await mkdir(outputDirectory, { recursive: true })

for (const item of registry.items) {
  const files = await Promise.all(
    item.files.map(async (file) => ({
      path: basename(file.path),
      type: file.type,
      content: await readFile(file.path, "utf8"),
    }))
  )
  const payload = {
    name: item.name,
    type: item.type,
    title: item.title,
    description: item.description,
    dependencies: item.dependencies ?? [],
    registryDependencies: item.registryDependencies ?? [],
    files,
  }
  await writeFile(
    join(outputDirectory, `${item.name}.json`),
    `${JSON.stringify(payload, null, 2)}\n`
  )
}

console.log(
  `Wrote ${registry.items.length} shadcn registry items to ${outputDirectory}/`
)
