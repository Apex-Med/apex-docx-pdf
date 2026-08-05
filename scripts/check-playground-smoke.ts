import { join } from "node:path"

import { chromium, type Locator, type Page } from "playwright"

const repositoryRoot = join(import.meta.dir, "..")
const webRoot = join(repositoryRoot, "apps", "web")
const host = "127.0.0.1"
const port = 4179
const baseUrl = `http://${host}:${port}`
const pdfiumCdnUrl =
  "https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/pdfium.wasm"
const pdfiumWasmPath = findPdfiumWasm()

const server = Bun.spawn({
  cmd: [
    "bun",
    "run",
    "dev",
    "--",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ],
  cwd: webRoot,
  // Never let a developer's shell turn this into a live Convex test.
  env: { ...process.env, CONVEX_URL: "", VITE_CONVEX_URL: "" },
  stdout: "pipe",
  stderr: "pipe",
})
const serverOutput = Promise.all([
  new Response(server.stdout).text(),
  new Response(server.stderr).text(),
]).then((chunks) => chunks.join("\n"))
await waitForServer(server)
const browser = await chromium.launch({ headless: true })

try {
  const desktopPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  await installOfflineViewerAsset(desktopPage)
  const desktopErrors = monitorRuntimeErrors(desktopPage)
  await verifyLandingAndPlayground(desktopPage)
  const renderedPages = await verifyPlaygroundWorkflow(desktopPage)
  assertNoRuntimeErrors("desktop application smoke", desktopErrors)

  const cancellationPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  await installOfflineViewerAsset(cancellationPage)
  const cancellationErrors = monitorRuntimeErrors(cancellationPage)
  await verifyCancellationReset(cancellationPage)
  assertNoRuntimeErrors("cancellation smoke", cancellationErrors)

  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  })
  await installOfflineViewerAsset(mobilePage)
  const mobileErrors = monitorRuntimeErrors(mobilePage)
  await verifyMobileTabs(mobilePage)
  assertNoRuntimeErrors("mobile application smoke", mobileErrors)

  console.log(
    `Playground application smoke passed in Chromium: ${JSON.stringify({
      landing: "loaded",
      playground: "local-only",
      renderedPages,
      pdfViewer: "portrait-first-page",
      download: "valid-pdf",
      dataSynchronization: "form-to-json",
      invalidJson: "render-disabled",
      staleRender: "cleared",
      resetActions: ["cancel", "remove"],
      mobileTabs: "keyboard-operable",
      runtimeErrors: 0,
    })}`
  )
} finally {
  await browser.close()
  server.kill()
  await server.exited
}

async function waitForServer(serverProcess: Bun.Subprocess): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Vite exited before the smoke started:\n${await serverOutput}`
      )
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await Bun.sleep(100)
  }
  throw new Error("Timed out waiting for the local Vite application")
}

async function verifyLandingAndPlayground(page: Page): Promise<void> {
  const response = await page.goto(baseUrl, { waitUntil: "load" })
  assert(response?.ok(), `Landing page returned HTTP ${response?.status()}`)
  await expectVisible(
    page.getByRole("heading", {
      level: 1,
      name: "Word templates. Deterministic PDFs.",
    }),
    "landing heading"
  )

  const playgroundLink = page
    .getByRole("main")
    .getByRole("link", { name: "Open playground" })
  await expectVisible(playgroundLink, "landing playground link")
  await playgroundLink.click()
  await page.waitForURL(`${baseUrl}/playground`)
  await page.waitForLoadState("load")
  await expectVisible(
    page.getByRole("heading", { level: 1, name: "Document playground" }),
    "playground heading"
  )
  await expectVisible(page.getByText("Local-only", { exact: true }), "mode")
  await expectVisible(
    page.getByRole("status").filter({ hasText: "Waiting for a template" }),
    "initial playground status"
  )
}

async function verifyPlaygroundWorkflow(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Use sample template" }).click()
  const renderStatus = page
    .getByRole("status")
    .filter({ hasText: /Rendered \d+ pages?/u })
  await renderStatus.waitFor({ state: "visible", timeout: 30_000 })
  const statusText = (await renderStatus.textContent()) ?? ""
  const renderedPages = Number(/Rendered (\d+) pages?/u.exec(statusText)?.[1])
  assert(
    Number.isInteger(renderedPages) && renderedPages > 0,
    `Unexpected render status: ${statusText}`
  )

  const firstPdfPage = page.locator('[data-pdf-viewer-page="1"]')
  await firstPdfPage.waitFor({ state: "visible", timeout: 30_000 })
  const firstPageBox = await firstPdfPage.boundingBox()
  assert(
    firstPageBox && firstPageBox.height > firstPageBox.width,
    "The first rendered PDF page was not visibly upright/portrait"
  )

  const patientName = page.getByLabel(/patient\.fullName/u)
  await expectVisible(patientName, "generated patient name field")
  await patientName.fill("Nandi Dlamini")
  await expectVisible(
    page.getByRole("status").filter({
      hasText: "Data changed — render again",
    }),
    "stale render status"
  )
  assert(
    (await page.locator('[data-pdf-viewer-page="1"]').count()) === 0,
    "Editing generated data did not clear the stale rendered PDF"
  )

  const dataPanel = page.locator("#playground-panel-data")
  await dataPanel.getByRole("tab", { name: "JSON" }).click()
  const jsonEditor = dataPanel.locator(".cm-content")
  await expectVisible(jsonEditor, "JSON editor")
  assert(
    (await jsonEditor.textContent())?.includes("Nandi Dlamini"),
    "The generated form edit was not synchronized into JSON"
  )

  await jsonEditor.click()
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.insertText("{")
  await expectVisible(dataPanel.getByRole("alert"), "invalid JSON alert")
  assert(
    await page.getByRole("button", { name: "Render PDF" }).isDisabled(),
    "Render PDF remained enabled for invalid JSON"
  )

  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.insertText(
    JSON.stringify({
      patient: { fullName: "Nandi Dlamini" },
      document: { reference: "AX-2026-001" },
      invoice: {
        title: "veterinary care invoice",
        issuedDate: "5 August 2026",
        dueDate: "19 August 2026",
        items: [
          {
            description: "Clinical consultation",
            quantity: 1,
            unitPrice: 1250,
            amount: 1250,
          },
        ],
        total: 1250,
      },
    })
  )
  await expectHidden(dataPanel.getByRole("alert"), "invalid JSON alert")

  const renderButton = page.getByRole("button", { name: "Render PDF" })
  assert(await renderButton.isEnabled(), "Render PDF did not re-enable")
  await renderButton.click()
  await page
    .getByRole("status")
    .filter({ hasText: /Rendered \d+ pages?/u })
    .waitFor({ state: "visible", timeout: 30_000 })

  const actionsButton = page.getByRole("button", { name: "Open PDF actions" })
  await expectVisible(actionsButton, "PDF viewer actions")
  await actionsButton.click()
  const downloadItem = page.getByRole("menuitem", { name: "Download" })
  await expectVisible(downloadItem, "PDF download action")
  assert(await downloadItem.isEnabled(), "PDF download action was disabled")
  const downloadPromise = page.waitForEvent("download")
  await downloadItem.click()
  const download = await downloadPromise
  assert(
    download.suggestedFilename() === "apex-render.pdf",
    `Unexpected PDF download name: ${download.suggestedFilename()}`
  )
  const downloadPath = await download.path()
  assert(downloadPath, "Playwright did not provide a downloaded PDF path")
  const downloadBytes = new Uint8Array(
    await Bun.file(downloadPath).arrayBuffer()
  )
  assert(
    new TextDecoder().decode(downloadBytes.subarray(0, 5)) === "%PDF-",
    "Downloaded result did not have a PDF header"
  )

  await page.getByRole("button", { name: "Remove template" }).click()
  await expectVisible(
    page.getByRole("status").filter({ hasText: "Waiting for a template" }),
    "template removal reset status"
  )
  assert(
    (await page.getByText("Your PDF will appear here").count()) === 1,
    "Removing the template did not reset the result panel"
  )
  assert(
    await renderButton.isDisabled(),
    "Render remained enabled after remove"
  )

  return renderedPages
}

async function verifyCancellationReset(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/playground`, { waitUntil: "load" })
  await page.getByRole("button", { name: "Use sample template" }).click()
  const cancelButton = page.getByRole("button", { name: "Cancel" })
  await cancelButton.waitFor({ state: "visible", timeout: 5_000 })
  await cancelButton.evaluate((button: HTMLButtonElement) => button.click())
  await expectVisible(
    page.getByRole("status").filter({ hasText: "Operation cancelled" }),
    "cancelled operation status"
  )
  assert(
    (await page.getByRole("button", { name: "Remove template" }).count()) === 0,
    "Cancelling did not clear the selected template"
  )
  assert(
    await page.getByRole("button", { name: "Render PDF" }).isDisabled(),
    "Cancelling did not disable rendering"
  )
}

async function verifyMobileTabs(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/playground`, { waitUntil: "load" })
  await waitForEnabled(
    page.getByRole("button", { name: "Use sample template" }),
    "hydrated sample button"
  )
  const tabs = page.getByRole("tablist", { name: "Playground panels" })
  await expectVisible(tabs, "mobile playground tabs")
  const templateTab = tabs.getByRole("tab", { name: /Template/u })
  const dataTab = tabs.getByRole("tab", { name: /Data/u })
  const resultTab = tabs.getByRole("tab", { name: /Result/u })

  assert(
    (await templateTab.getAttribute("aria-selected")) === "true" &&
      (await templateTab.getAttribute("tabindex")) === "0",
    "Template tab was not the initial roving-tabindex selection"
  )
  await templateTab.focus()
  await page.keyboard.press("ArrowRight")
  await waitForAttribute(dataTab, "aria-selected", "true")
  assert(
    (await dataTab.getAttribute("aria-selected")) === "true" &&
      (await dataTab.getAttribute("tabindex")) === "0",
    "ArrowRight did not select the Data tab"
  )
  assert(
    await dataTab.evaluate((element) => element === document.activeElement),
    "ArrowRight did not move focus to the Data tab"
  )
  await page.keyboard.press("End")
  await waitForAttribute(resultTab, "aria-selected", "true")
  assert(
    (await resultTab.getAttribute("aria-selected")) === "true",
    "End did not select the Result tab"
  )
  assert(
    await page.locator("#playground-panel-result").isVisible(),
    "Selected mobile Result panel was not visible"
  )
  assert(
    !(await page.locator("#playground-panel-template").isVisible()),
    "Unselected mobile Template panel remained visible"
  )
  await page.keyboard.press("Home")
  await waitForAttribute(templateTab, "aria-selected", "true")
  assert(
    (await templateTab.getAttribute("aria-selected")) === "true",
    "Home did not return to the Template tab"
  )
}

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== host &&
      request.url() !== pdfiumCdnUrl
    ) {
      errors.push(`external request: ${request.method()} ${request.url()}`)
    }
  })
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/__tsd/console-pipe/sse") return
    errors.push(
      `request: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "failed"})`
    )
  })
  return errors
}

async function installOfflineViewerAsset(page: Page): Promise<void> {
  await page.route(pdfiumCdnUrl, async (route) => {
    await route.fulfill({
      path: pdfiumWasmPath,
      contentType: "application/wasm",
    })
  })
}

function findPdfiumWasm(): string {
  const match = new Bun.Glob(
    "node_modules/.bun/@embedpdf+pdfium@*/node_modules/@embedpdf/pdfium/dist/pdfium.wasm"
  )
    .scanSync({
      cwd: repositoryRoot,
      absolute: true,
      dot: true,
      onlyFiles: true,
    })
    .next().value
  if (!match) {
    throw new Error(
      "Could not find the locked @embedpdf/pdfium WASM asset. Run bun install first."
    )
  }
  return match
}

async function expectVisible(locator: Locator, label: string): Promise<void> {
  try {
    await locator.waitFor({ state: "visible", timeout: 10_000 })
  } catch (error) {
    throw new Error(`Expected visible ${label}`, { cause: error })
  }
}

async function expectHidden(locator: Locator, label: string): Promise<void> {
  try {
    await locator.waitFor({ state: "hidden", timeout: 10_000 })
  } catch (error) {
    throw new Error(`Expected hidden ${label}`, { cause: error })
  }
}

async function waitForAttribute(
  locator: Locator,
  name: string,
  value: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await locator.getAttribute(name)) === value) return
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for ${name}=${value}`)
}

async function waitForEnabled(locator: Locator, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await locator.isEnabled()) return
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for enabled ${label}`)
}

function assertNoRuntimeErrors(label: string, errors: readonly string[]): void {
  if (errors.length > 0) {
    throw new Error(`${label} emitted runtime errors:\n${errors.join("\n")}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
