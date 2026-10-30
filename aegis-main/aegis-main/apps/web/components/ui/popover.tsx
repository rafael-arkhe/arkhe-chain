"use client"

/**
 * Popover sem `@radix-ui/react-popover` — implementação mínima
 * (security-app não tem o pacote radix-popover instalado). Usa um
 * portal-less container posicionado com click-outside e ESC.
 */

import * as React from "react"

import { cn } from "@/lib/utils"

interface PopoverContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null)

function usePopover() {
  const ctx = React.useContext(PopoverContext)
  if (!ctx) throw new Error("Popover.* must be used inside <Popover>")
  return ctx
}

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Popover({ open: controlled, onOpenChange, children }: PopoverProps) {
  const [internal, setInternal] = React.useState(false)
  const open = controlled ?? internal
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInternal(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )
  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  )
}

interface PopoverTriggerProps {
  asChild?: boolean
  children: React.ReactElement
}

export function PopoverTrigger({ asChild = false, children }: PopoverTriggerProps) {
  const { open, setOpen, triggerRef } = usePopover()
  const child = children as React.ReactElement & {
    ref?: React.Ref<HTMLElement>
    props: { onClick?: (e: React.MouseEvent) => void }
  }

  const handleClick = (e: React.MouseEvent) => {
    child.props.onClick?.(e)
    setOpen(!open)
  }

  if (asChild) {
    return React.cloneElement(child, {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node
        const r = (child as { ref?: React.Ref<HTMLElement> }).ref
        if (typeof r === "function") r(node)
        else if (r && typeof r === "object")
          (r as React.MutableRefObject<HTMLElement | null>).current = node
      },
      onClick: handleClick,
    } as Record<string, unknown>)
  }
  return (
    <button
      ref={(n) => {
        triggerRef.current = n
      }}
      type="button"
      onClick={handleClick}
    >
      {children}
    </button>
  )
}

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end"
  sideOffset?: number
}

export function PopoverContent({
  align = "center",
  sideOffset = 4,
  className,
  children,
  ...props
}: PopoverContentProps) {
  const { open, setOpen, triggerRef } = usePopover()
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const trig = triggerRef.current
    if (!trig) return
    const rect = trig.getBoundingClientRect()
    const top = rect.bottom + sideOffset + window.scrollY
    let left = rect.left + window.scrollX
    if (align === "center") left = rect.left + rect.width / 2 + window.scrollX
    if (align === "end") left = rect.right + window.scrollX
    setPos({ top, left })
  }, [open, align, sideOffset, triggerRef])

  React.useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, setOpen, triggerRef])

  if (!open || !pos) return null
  const style: React.CSSProperties = {
    position: "absolute",
    top: pos.top,
    left: pos.left,
    transform:
      align === "center" ? "translateX(-50%)" : align === "end" ? "translateX(-100%)" : "none",
    zIndex: 60,
  }
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "min-w-[8rem] rounded-none border border-border-light bg-canvas-light text-text-on-light shadow-md outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
