import { motion, useReducedMotion } from 'motion/react'

/** Amicro-style pulse dots loader (vendored; @amicro/pulse-dots registry 429). */
export function PulseDots({ label = 'Loading' }: { label?: string }) {
  const reduce = useReducedMotion()

  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 bg-accent"
            animate={
              reduce
                ? { opacity: 1, scale: 1 }
                : { opacity: [0.35, 1, 0.35], scale: [0.85, 1.1, 0.85] }
            }
            transition={{
              duration: 0.9,
              repeat: reduce ? 0 : Infinity,
              delay: i * 0.14,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </div>
    </div>
  )
}