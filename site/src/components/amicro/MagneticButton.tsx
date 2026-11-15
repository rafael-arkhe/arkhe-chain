import { motion, useMotionValue, useSpring } from 'motion/react'
import type { MouseEvent, ReactNode } from 'react'

const spring = { stiffness: 260, damping: 22, mass: 0.6 }

type MagneticButtonProps = {
  children: ReactNode
  className?: string
  href?: string
  onClick?: () => void
  rel?: string
  target?: string
}

/**
 * Amicro-style magnetic button (vendored pattern; registry add returned 429).
 * MIT — matches Amicro spring + translate hover model.
 */
export function MagneticButton({
  children,
  className = '',
  href,
  onClick,
  rel,
  target,
}: MagneticButtonProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, spring)
  const sy = useSpring(y, spring)

  const onMove = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    x.set(dx * 0.18)
    y.set(dy * 0.18)
  }

  const onLeave = () => {
    x.set(0)
    y.set(0)
  }

  const shared =
    'relative inline-flex items-center justify-center gap-2 border border-surface-line bg-surface-raised px-5 py-2.5 text-sm font-medium tracking-wide text-ink transition-colors duration-300 hover:border-accent/50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

  const inner = (
    <motion.span
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="inline-flex items-center gap-2"
    >
      {children}
    </motion.span>
  )

  if (href) {
    return (
      <a
        href={href}
        rel={rel}
        target={target}
        className={`${shared} ${className}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {inner}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {inner}
    </button>
  )
}