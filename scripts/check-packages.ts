const packages = [
  "browser",
  "core",
  "docx",
  "engine",
  "fonts",
  "images",
  "layout",
  "pdf",
  "template",
]

for (const name of packages) {
  const directory = `packages/${name}/dist`
  for (const command of [
    ["bunx", "publint", "run", directory, "--strict", "--pack", "false"],
    ["bunx", "attw", "--pack", directory, "--profile", "esm-only"],
    ["npm", "pack", "--dry-run", "--json", directory],
  ]) {
    console.log(`\n${command.join(" ")}`)
    const result = Bun.spawnSync(command, {
      stdout: "inherit",
      stderr: "inherit",
    })
    if (result.exitCode !== 0) {
      throw new Error(
        `${name}: ${command[1]} failed with exit code ${result.exitCode}`
      )
    }
  }
}
