"use client"

/**
 * Toast minimalista — substitui `sonner` (não está instalado no
 * security-app). API compatível: `toast(msg)`, `toast.success(msg)`,
 * `toast.error(msg)`. Renderize <Toaster /> uma vez perto do root da
 * página pra ver os toasts.
 */

import * as React from "react"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

import { cn } from "@/lib/utils"

type ToastKind = "info" | "success" | "error"
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (items: ToastItem[]) => void

let _seq = 0
let _items: ToastItem[] = []
const _listeners = new Set<Listener>()

function emit() {
  for (const l of _listeners) l(_items)
}

function add(kind: ToastKind, message: string) {
  const id = ++_seq
  _items = [..._items, { id, kind, message }]
  emit()
  setTimeout(() => {
    _items = _items.filter((t) => t.id !== id)
    emit()
  }, 4500)
}

function remove(id: number) {
  _items = _items.filter((t) => t.id !== id)
  emit()
}

type ToastFn = ((message: string) => void) & {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const _toast: ToastFn = ((message: string) => add("info", message)) as ToastFn
_toast.success = (m: string) => add("success", m)
_toast.error = (m: string) => add("error", m)
_toast.info = (m: string) => add("info", m)

export const toast = _toast

export function Toaster({
  position = "bottom-right",
}: {
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  theme?: "light" | "dark"
}) {
  const [items, setItems] = React.useState<ToastItem[]>(_items)
  React.useEffect(() => {
    const l: Listener = (next) => setItems(next)
    _listeners.add(l)
    return () => {
      _listeners.delete(l)
    }
  }, [])

  const posCls =
    position === "bottom-right"
      ? "bottom-4 right-4"
      : position === "bottom-left"
        ? "bottom-4 left-4"
        : position === "top-right"
          ? "top-4 right-4"
          : "top-4 left-4"

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-2 pointer-events-none",
        posCls,
      )}
      aria-live="polite"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem
  onClose: () => void
}) {
  const tone =
    item.kind === "success"
      ? "border-success/40 bg-success/10 text-text-on-light"
      : item.kind === "error"
        ? "border-danger/40 bg-danger/10 text-text-on-light"
        : "border-border-light bg-canvas-light text-text-on-light"
  const Icon =
    item.kind === "success"
      ? CheckCircle2
      : item.kind === "error"
        ? AlertTriangle
        : Info
  const iconTone =
    item.kind === "success"
      ? "text-success"
      : item.kind === "error"
        ? "text-danger"
        : "text-muted-on-light"
  return (
    <div
      className={cn(
        "pointer-events-auto min-w-[260px] max-w-[420px] rounded-none border px-3 py-2 shadow-sm flex items-start gap-2",
        tone,
      )}
      role="status"
    >
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconTone)} strokeWidth={1.5} />
      <div className="flex-1 text-[12px] leading-snug">{item.message}</div>
      <button
        type="button"
        onClick={onClose}
        className="text-muted-on-light hover:text-text-on-light"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
