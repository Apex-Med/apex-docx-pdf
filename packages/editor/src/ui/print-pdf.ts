/**
 * Print engine-authored PDF bytes instead of the surrounding webpage.
 * Loads the PDF in a hidden iframe so the browser print dialog uses the
 * paginated document, then revokes the object URL after print.
 */

export type PrintPdfBytesOptions = Readonly<{
  ownerDocument?: Document
  /** Extra wait after the frame reports ready so the PDF viewer can attach. */
  readyDelayMs?: number
  /** Test hook. Defaults to focusing the frame and calling `print()`. */
  printWindow?: (frameWindow: Window) => void
}>

const PRINT_FRAME_LOAD_FALLBACK_MS = 2_000
const PRINT_FRAME_CLEANUP_MS = 60_000

/** Print a PDF blob through a hidden iframe instead of `window.print()`. */
export async function printPdfBytes(
  bytes: Uint8Array,
  options: PrintPdfBytesOptions = {}
): Promise<void> {
  const ownerDocument = options.ownerDocument ?? globalThis.document
  if (!ownerDocument) {
    throw new Error("Print is only available in a browser")
  }

  const parent = ownerDocument.body ?? ownerDocument.documentElement
  if (!parent) {
    throw new Error("Print is only available in a browser")
  }

  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const iframe = ownerDocument.createElement("iframe")
  iframe.setAttribute("title", "Print document")
  iframe.setAttribute("aria-hidden", "true")
  iframe.setAttribute("data-apex-print-frame", "true")
  iframe.src = url
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "1px"
  iframe.style.height = "1px"
  iframe.style.border = "0"
  iframe.style.opacity = "0"
  iframe.style.pointerEvents = "none"

  parent.appendChild(iframe)

  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    iframe.remove()
    URL.revokeObjectURL(url)
  }

  try {
    const frameWindow = await waitForPrintFrame(iframe)
    const delay = options.readyDelayMs ?? 50
    if (delay > 0) {
      await wait(delay)
    }
    const print = options.printWindow ?? defaultPrintWindow
    frameWindow.addEventListener("afterprint", cleanup, { once: true })
    globalThis.setTimeout(cleanup, PRINT_FRAME_CLEANUP_MS)
    print(frameWindow)
  } catch (error) {
    cleanup()
    throw error
  }
}

function defaultPrintWindow(frameWindow: Window): void {
  frameWindow.focus()
  frameWindow.print()
}

function waitForPrintFrame(iframe: HTMLIFrameElement): Promise<Window> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (win: Window | null, error?: Error): void => {
      if (settled) return
      settled = true
      iframe.removeEventListener("load", onLoad)
      globalThis.clearTimeout(timer)
      if (win) resolve(win)
      else reject(error ?? new Error("Print frame failed to load"))
    }
    const onLoad = (): void => {
      finish(iframe.contentWindow)
    }
    iframe.addEventListener("load", onLoad)
    const timer = globalThis.setTimeout(() => {
      if (iframe.contentWindow) finish(iframe.contentWindow)
      else finish(null, new Error("Print frame timed out"))
    }, PRINT_FRAME_LOAD_FALLBACK_MS)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}
