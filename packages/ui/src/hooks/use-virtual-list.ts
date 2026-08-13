"use client"

import * as React from "react"

export type VirtualListItem = Readonly<{
  index: number
  start: number
  size: number
}>

export type UseVirtualListOptions = Readonly<{
  count: number
  estimateSize: number | ((index: number) => number)
  overscan?: number
  getScrollElement: () => HTMLElement | null
  getItemKey?: (index: number) => string | number
}>

export type UseVirtualListResult = Readonly<{
  virtualItems: readonly VirtualListItem[]
  totalSize: number
  scrollToIndex: (
    index: number,
    options?: { align?: "start" | "center" | "end" }
  ) => void
}>

/**
 * Lightweight fixed/estimated-size virtualizer for long lists (e.g. Google
 * Fonts catalog). No external dependency.
 */
export function useVirtualList(
  options: UseVirtualListOptions
): UseVirtualListResult {
  const {
    count,
    estimateSize,
    overscan = 6,
    getScrollElement,
    getItemKey,
  } = options

  const [range, setRange] = React.useState({ start: 0, end: 0, scrollTop: 0 })

  const sizeFor = React.useCallback(
    (index: number): number =>
      typeof estimateSize === "function" ? estimateSize(index) : estimateSize,
    [estimateSize]
  )

  const offsets = React.useMemo(() => {
    const starts = new Array<number>(count)
    let acc = 0
    for (let i = 0; i < count; i++) {
      starts[i] = acc
      acc += sizeFor(i)
    }
    return { starts, totalSize: acc }
  }, [count, sizeFor])

  React.useEffect(() => {
    const el = getScrollElement()
    if (!el) return

    const update = (): void => {
      const scrollTop = el.scrollTop
      const viewport = el.clientHeight
      let start = 0
      while (
        start < count - 1 &&
        (offsets.starts[start]! + sizeFor(start)) < scrollTop
      ) {
        start++
      }
      let end = start
      const bottom = scrollTop + viewport
      while (end < count - 1 && offsets.starts[end]! < bottom) {
        end++
      }
      setRange({
        start: Math.max(0, start - overscan),
        end: Math.min(count - 1, end + overscan),
        scrollTop,
      })
    }

    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro?.disconnect()
    }
  }, [count, getScrollElement, offsets.starts, overscan, sizeFor])

  const virtualItems = React.useMemo((): VirtualListItem[] => {
    if (count === 0) return []
    const items: VirtualListItem[] = []
    for (let i = range.start; i <= range.end; i++) {
      items.push({
        index: i,
        start: offsets.starts[i]!,
        size: sizeFor(i),
      })
      void getItemKey?.(i)
    }
    return items
  }, [count, getItemKey, offsets.starts, range.end, range.start, sizeFor])

  const scrollToIndex = React.useCallback(
    (index: number, opts?: { align?: "start" | "center" | "end" }) => {
      const el = getScrollElement()
      if (!el || index < 0 || index >= count) return
      const start = offsets.starts[index]!
      const size = sizeFor(index)
      const align = opts?.align ?? "start"
      let top = start
      if (align === "center") top = start - el.clientHeight / 2 + size / 2
      if (align === "end") top = start - el.clientHeight + size
      el.scrollTop = Math.max(0, top)
    },
    [count, getScrollElement, offsets.starts, sizeFor]
  )

  return {
    virtualItems,
    totalSize: offsets.totalSize,
    scrollToIndex,
  }
}
