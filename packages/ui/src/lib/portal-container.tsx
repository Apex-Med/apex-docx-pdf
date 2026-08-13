"use client"

import * as React from "react"

export type PortalContainer = HTMLElement | ShadowRoot | null

export type PortalContainerRef = React.RefObject<PortalContainer>

const PortalContainerContext = React.createContext<PortalContainerRef | null>(
  null
)

/**
 * Provides a portal mount target for Base UI overlays (Popover, Select,
 * Dialog, Menu, Tooltip, etc.). Pass a ref whose `.current` is a ShadowRoot
 * (embed) or HTMLElement. Outside the provider, portals use document.body.
 */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: PortalContainerRef
  children: React.ReactNode
}): React.ReactElement {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

/** Ref suitable for Base UI Portal `container` prop (supports ShadowRoot). */
export function usePortalContainer():
  | PortalContainerRef
  | undefined {
  const ctx = React.useContext(PortalContainerContext)
  return ctx ?? undefined
}
