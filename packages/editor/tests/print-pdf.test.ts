import { describe, expect, test } from "bun:test"

import { printPdfBytes } from "../src/ui/print-pdf"

function pdfHeaderBytes(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7 test")
}

function createPrintHost(options?: {
  fireLoad?: boolean
  contentWindow?: Window | null
  missingParent?: boolean
}): {
  ownerDocument: Document
  iframe: {
    src: string
    style: Record<string, string>
    attributes: Record<string, string>
    contentWindow: Window | null
    removed: boolean
    loadHandler: (() => void) | null
  }
  printed: Window[]
  focused: Window[]
} {
  const fireLoad = options?.fireLoad ?? true
  const printed: Window[] = []
  const focused: Window[] = []
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  const dispatch = (type: string): boolean => {
    const event = new Event(type)
    listeners.get(type)?.forEach((listener) => {
      if (typeof listener === "function") listener(event)
    })
    return true
  }

  const frameWindow = {
    focus() {
      focused.push(this as unknown as Window)
    },
    print() {
      printed.push(this as unknown as Window)
      dispatch("afterprint")
    },
    dispatchEvent(event: Event) {
      return dispatch(event.type)
    },
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject
    ) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject
    ) {
      listeners.get(type)?.delete(listener)
    },
  } as unknown as Window

  const iframe = {
    src: "",
    style: {} as Record<string, string>,
    attributes: {} as Record<string, string>,
    contentWindow:
      options && "contentWindow" in options
        ? (options.contentWindow ?? null)
        : frameWindow,
    removed: false,
    loadHandler: null as (() => void) | null,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value
    },
    addEventListener(type: string, handler: () => void) {
      if (type === "load") {
        this.loadHandler = handler
        if (fireLoad) queueMicrotask(handler)
      }
    },
    removeEventListener(type: string, handler: () => void) {
      if (type === "load" && this.loadHandler === handler) {
        this.loadHandler = null
      }
    },
    remove() {
      this.removed = true
    },
  }

  const parent = {
    appendChild<T>(node: T): T {
      return node
    },
  }

  const ownerDocument = {
    createElement(tag: string) {
      expect(tag).toBe("iframe")
      return iframe
    },
    body: options?.missingParent ? null : parent,
    documentElement: options?.missingParent ? null : parent,
  } as unknown as Document

  return { ownerDocument, iframe, printed, focused }
}

describe("printPdfBytes", () => {
  test("prints the PDF iframe window instead of the host page", async () => {
    const host = createPrintHost()
    const pagePrintCalls: number[] = []
    const originalPrint = globalThis.window?.print
    if (globalThis.window) {
      globalThis.window.print = () => {
        pagePrintCalls.push(1)
      }
    }

    try {
      await printPdfBytes(pdfHeaderBytes(), {
        ownerDocument: host.ownerDocument,
        readyDelayMs: 0,
      })
    } finally {
      if (globalThis.window && originalPrint) {
        globalThis.window.print = originalPrint
      }
    }

    expect(host.iframe.attributes["data-apex-print-frame"]).toBe("true")
    expect(host.iframe.attributes.title).toBe("Print document")
    expect(host.iframe.src).toMatch(/^blob:/)
    expect(host.iframe.style.opacity).toBe("0")
    expect(host.printed).toHaveLength(1)
    expect(host.focused).toHaveLength(1)
    expect(pagePrintCalls).toEqual([])
    expect(host.iframe.removed).toBe(true)
  })

  test("uses an injected printWindow hook and still cleans up the frame", async () => {
    const host = createPrintHost({ fireLoad: true })
    const seen: Window[] = []

    await printPdfBytes(pdfHeaderBytes(), {
      ownerDocument: host.ownerDocument,
      readyDelayMs: 0,
      printWindow: (frameWindow) => {
        seen.push(frameWindow)
        frameWindow.dispatchEvent?.(new Event("afterprint"))
      },
    })

    expect(seen).toHaveLength(1)
    expect(host.iframe.removed).toBe(true)
  })

  test("throws when no document body is available", async () => {
    const host = createPrintHost({ missingParent: true })
    await expect(
      printPdfBytes(pdfHeaderBytes(), {
        ownerDocument: host.ownerDocument,
        readyDelayMs: 0,
      })
    ).rejects.toThrow("Print is only available in a browser")
  })
})
