const MINT_VERSION = "4.2.776"

const checks = [["validate"], ["broken-links", "--check-anchors"]] as const

for (const args of checks) {
  const command = ["bunx", "--bun", `mint@${MINT_VERSION}`, ...args]
  console.log(`$ ${command.join(" ")}`)

  const child = Bun.spawn(command, {
    cwd: import.meta.dir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    console.error(`Mintlify check failed with exit code ${exitCode}.`)
    globalThis.process.exit(exitCode)
  }
}
