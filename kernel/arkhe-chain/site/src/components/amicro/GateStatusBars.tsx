import { motion, useReducedMotion } from 'motion/react'

export type GateRow = {
  id: string
  status: 'logged' | 'pending' | 'partial' | 'open' | 'scaffold'
  label: string
  detail: string
}

const fill: Record<GateRow['status'], string> = {
  logged: 'bg-logged',
  pending: 'bg-warn',
  partial: 'bg-accent',
  open: 'bg-open',
  scaffold: 'bg-surface-line',
}

/** Mono telemetry bars — categorical gate states, not performance metrics. */
export function GateStatusBars({ rows }: { rows: GateRow[] }) {
  const reduce = useReducedMotion()

  return (
    <ul className="space-y-4 font-mono text-xs">
      {rows.map((row, i) => (
        <li key={row.id} className="grid gap-1.5 sm:grid-cols-[4rem_1fr] sm:items-center sm:gap-4">
          <span className="text-ink-muted">{row.id}</span>
          <div>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink">{row.label}</span>
              <span className="text-ink-muted">{row.detail}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-surface-line">
              <motion.div
                className={`h-full ${fill[row.status]}`}
                initial={{ width: reduce ? '100%' : '0%' }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  duration: 0.45,
                  delay: reduce ? 0 : i * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{ maxWidth: row.status === 'open' ? '42%' : '100%' }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}