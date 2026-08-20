import type { SemanticDocument } from "@apexmed/core"

import { EDITOR_CSS } from "../styles/editor-css"
import type { EditorController } from "../ui/Editor"
import { type EmbedChangeDetail, type EmbedErrorDetail } from "./helpers"
import {
  hoistPropertyRulesToDocument,
  transformCssForShadowDom,
} from "./shadow-css"

export { transformCssForShadowDom, hoistPropertyRulesToDocument }
export {
  parseEmbedDocx,
  serializeEmbedDocx,
  serializeEmbedPdf,
  toUint8Array,
  type EmbedChangeDetail,
  type EmbedErrorDetail,
} from "./helpers"

const ELEMENT_NAME = "apex-docx-editor"

type EditorElementInstance = {
  connectedCallback(): void
  disconnectedCallback(): void
  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void
  getSelectionRoot(): Document | ShadowRoot
  loadDocx(bytes: Uint8Array | ArrayBuffer): Promise<void>
  getDocx(): Promise<Uint8Array>
  getPdf(): Promise<Uint8Array>
  setReadOnly(value: boolean): void
  getDocument(): SemanticDocument | null
}

/**
 * Embeddable custom element with shadow DOM hosting the editor UI.
 * Selection must use view.root, never document.getSelection().
 * Defined only when HTMLElement/customElements exist (browser).
 */
export type ApexDocxEditorElement = HTMLElement & EditorElementInstance

function createEditorElementClass():
  (new () => ApexDocxEditorElement) | undefined {
  if (typeof HTMLElement === "undefined") return undefined

  return class ApexDocxEditorElementImpl
    extends HTMLElement
    implements EditorElementInstance
  {
    static get observedAttributes(): string[] {
      return ["readonly", "css-url"]
    }

    #shadow: ShadowRoot
    #mounted = false
    #controller: EditorController | null = null
    #readyPromise: Promise<void>
    #resolveReady: (() => void) | null = null
    #revision = 0
    #mountGeneration = 0

    constructor() {
      super()
      this.#shadow = this.attachShadow({ mode: "open" })
      this.#readyPromise = new Promise((resolve) => {
        this.#resolveReady = resolve
      })
    }

    connectedCallback(): void {
      if (this.#mounted) return
      this.#mounted = true
      void this.#mount()
    }

    disconnectedCallback(): void {
      this.#mounted = false
      this.#mountGeneration += 1
      this.#controller?.destroy()
      this.#controller = null
      this.#shadow.innerHTML = ""
      this.#readyPromise = new Promise((resolve) => {
        this.#resolveReady = resolve
      })
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null
    ): void {
      if (name === "readonly" && oldValue !== newValue && this.#controller) {
        this.#controller.setReadOnly(newValue !== null)
      }
    }

    async #mount(): Promise<void> {
      const generation = ++this.#mountGeneration
      const cssUrl = this.getAttribute("css-url")
      const baseCss = EDITOR_CSS
      let extraCss = ""
      if (cssUrl) {
        try {
          const response = await fetch(cssUrl)
          extraCss = await response.text()
        } catch (error) {
          this.#emitError(
            error instanceof Error
              ? error.message
              : `Failed to fetch css-url: ${String(error)}`
          )
        }
      }
      if (generation !== this.#mountGeneration || !this.#mounted) return

      const transformed = transformCssForShadowDom(`${baseCss}\n${extraCss}`)
      hoistPropertyRulesToDocument(transformed.hoistedPropertyRules)
      const style = document.createElement("style")
      style.textContent = transformed.shadowCss
      const host = document.createElement("div")
      host.className = "apex-editor-host"
      host.setAttribute("data-apex-editor", "true")
      host.style.minHeight = "240px"
      host.style.height = "100%"
      this.#shadow.replaceChildren(style, host)

      try {
        const mod = await import("../ui/Editor")
        if (generation !== this.#mountGeneration || !this.#mounted) return
        const mount = mod.mountEditor
        if (typeof mount !== "function") {
          throw new Error("mountEditor is not available")
        }
        this.#controller = mount(host, {
          shadowRoot: this.#shadow,
          readOnly: this.hasAttribute("readonly"),
          onChange: () => {
            this.#revision += 1
            this.dispatchEvent(
              new CustomEvent<EmbedChangeDetail>("change", {
                detail: { revision: this.#revision },
                bubbles: true,
                composed: true,
              })
            )
          },
        })
        this.dispatchEvent(
          new CustomEvent("ready", {
            bubbles: true,
            composed: true,
          })
        )
        this.#resolveReady?.()
        this.#resolveReady = null
      } catch (error) {
        host.textContent = "Apex DOCX Editor"
        this.#emitError(error instanceof Error ? error.message : String(error))
        this.#resolveReady?.()
        this.#resolveReady = null
      }
    }

    #emitError(message: string): void {
      this.dispatchEvent(
        new CustomEvent<EmbedErrorDetail>("error", {
          detail: { message },
          bubbles: true,
          composed: true,
        })
      )
    }

    async #whenReady(): Promise<EditorController> {
      await this.#readyPromise
      if (!this.#controller) {
        throw new Error("Apex DOCX editor failed to mount")
      }
      return this.#controller
    }

    async loadDocx(bytes: Uint8Array | ArrayBuffer): Promise<void> {
      try {
        const controller = await this.#whenReady()
        await controller.loadDocx(bytes)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.#emitError(message)
        throw error
      }
    }

    async getDocx(): Promise<Uint8Array> {
      const controller = await this.#whenReady()
      return controller.getDocx()
    }

    async getPdf(): Promise<Uint8Array> {
      try {
        const controller = await this.#whenReady()
        return await controller.getPdf()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.#emitError(message)
        throw error
      }
    }

    setReadOnly(value: boolean): void {
      if (value) this.setAttribute("readonly", "")
      else this.removeAttribute("readonly")
      this.#controller?.setReadOnly(value)
    }

    getDocument(): SemanticDocument | null {
      return this.#controller?.getDocument() ?? null
    }

    getSelectionRoot(): Document | ShadowRoot {
      return this.#shadow
    }
  }
}

export const ApexDocxEditorElement = createEditorElementClass()

export function defineApexDocxEditorElement(): void {
  if (typeof customElements === "undefined") return
  if (!ApexDocxEditorElement) return
  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, ApexDocxEditorElement)
  }
}

/**
 * Thin IIFE-friendly loader that defines the custom element and
 * dynamically imports the editor chunk when first connected.
 */
export function loadEmbed(): void {
  defineApexDocxEditorElement()
}
