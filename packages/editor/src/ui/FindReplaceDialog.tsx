import { useEffect, useState } from "react"
import type { Node as PMNode } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import { TextSelection } from "prosemirror-state"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

export type FindMatch = Readonly<{ from: number; to: number }>

/** Case-sensitive or insensitive text search across a ProseMirror document. */
export function findTextInDoc(
  doc: PMNode,
  query: string,
  options: Readonly<{
    caseSensitive?: boolean
    from?: number
  }> = {}
): FindMatch | null {
  if (!query) return null
  const needle = options.caseSensitive ? query : query.toLowerCase()
  const pos = Math.max(0, options.from ?? 0)
  let found: FindMatch | null = null
  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (found || !node.isText || !node.text) return
    const haystack = options.caseSensitive ? node.text : node.text.toLowerCase()
    const localFrom = Math.max(0, pos - nodePos)
    const index = haystack.indexOf(needle, localFrom)
    if (index >= 0) {
      found = {
        from: nodePos + index,
        to: nodePos + index + query.length,
      }
    }
  })
  return found
}

export function findAllTextInDoc(
  doc: PMNode,
  query: string,
  options: Readonly<{ caseSensitive?: boolean }> = {}
): FindMatch[] {
  const matches: FindMatch[] = []
  let from = 0
  for (;;) {
    const match = findTextInDoc(doc, query, { ...options, from })
    if (!match) break
    matches.push(match)
    from = match.to
  }
  return matches
}

export type FindReplaceDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefer providing a live view getter for built-in find/replace. */
  getView?: () => EditorView | null
  onFind?: (query: string, options: { caseSensitive: boolean }) => boolean
  onReplace?: (
    query: string,
    replacement: string,
    options: { caseSensitive: boolean }
  ) => boolean
  onReplaceAll?: (
    query: string,
    replacement: string,
    options: { caseSensitive: boolean }
  ) => number
}>

export function FindReplaceDialog({
  open,
  onOpenChange,
  getView,
  onFind,
  onReplace,
  onReplaceAll,
}: FindReplaceDialogProps) {
  const [findText, setFindText] = useState("")
  const [replaceText, setReplaceText] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [status, setStatus] = useState("")

  useEffect(() => {
    if (open) setStatus("")
  }, [open])

  const runFind = (): boolean => {
    if (onFind) {
      const ok = onFind(findText, { caseSensitive })
      setStatus(ok ? "Found" : "No matches")
      return ok
    }
    const view = getView?.()
    if (!view || !findText) {
      setStatus("No matches")
      return false
    }
    const from = view.state.selection.to
    const match =
      findTextInDoc(view.state.doc, findText, { caseSensitive, from }) ??
      findTextInDoc(view.state.doc, findText, { caseSensitive, from: 0 })
    if (!match) {
      setStatus("No matches")
      return false
    }
    view.dispatch(
      view.state.tr
        .setSelection(
          TextSelection.create(view.state.doc, match.from, match.to)
        )
        .scrollIntoView()
    )
    view.focus()
    setStatus("Found")
    return true
  }

  const runReplace = (): boolean => {
    if (onReplace) {
      const ok = onReplace(findText, replaceText, { caseSensitive })
      setStatus(ok ? "Replaced" : "No matches")
      return ok
    }
    const view = getView?.()
    if (!view || !findText) {
      setStatus("No matches")
      return false
    }
    const { from, to, empty } = view.state.selection
    const selected = view.state.doc.textBetween(from, to, "\n", "\n")
    const selectedMatch = caseSensitive
      ? selected === findText
      : selected.toLowerCase() === findText.toLowerCase()
    if (!empty && selectedMatch) {
      view.dispatch(
        view.state.tr.insertText(replaceText, from, to).scrollIntoView()
      )
      setStatus("Replaced")
      return true
    }
    if (!runFind()) return false
    const next = view.state.selection
    view.dispatch(
      view.state.tr.insertText(replaceText, next.from, next.to).scrollIntoView()
    )
    setStatus("Replaced")
    return true
  }

  const runReplaceAll = (): number => {
    if (onReplaceAll) {
      const count = onReplaceAll(findText, replaceText, { caseSensitive })
      setStatus(count > 0 ? `Replaced ${count}` : "No matches")
      return count
    }
    const view = getView?.()
    if (!view || !findText) {
      setStatus("No matches")
      return 0
    }
    const matches = findAllTextInDoc(view.state.doc, findText, {
      caseSensitive,
    })
    if (matches.length === 0) {
      setStatus("No matches")
      return 0
    }
    let tr = view.state.tr
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const match = matches[i]!
      tr = tr.insertText(replaceText, match.from, match.to)
    }
    view.dispatch(tr.scrollIntoView())
    setStatus(`Replaced ${matches.length}`)
    return matches.length
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find and replace</DialogTitle>
          <DialogDescription>
            Search the document text and optionally replace matches.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Find</span>
            <Input
              value={findText}
              onChange={(event) => setFindText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  runFind()
                }
              }}
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Replace with</span>
            <Input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={caseSensitive}
              onCheckedChange={(checked) => setCaseSensitive(checked === true)}
            />
            Match case
          </label>
          {status ? (
            <p className="text-xs text-muted-foreground" role="status">
              {status}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => runFind()}>
            Find next
          </Button>
          <Button type="button" variant="outline" onClick={() => runReplace()}>
            Replace
          </Button>
          <Button type="button" onClick={() => runReplaceAll()}>
            Replace all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
