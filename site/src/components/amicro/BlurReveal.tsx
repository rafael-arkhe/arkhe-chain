import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

type BlurRevealProps = {
  children: ReactNode
  className?: string
  delay?: number
}

/** Amicro-style blur-in text reveal (vendored; @amicro/blur-reveal registry 429). */
export function BlurReveal({ children, className = '', delay = 0 }: BlurRevealProps) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={
        reduce
          ? { opacity: 1, filter: 'blur(0px)', y: 0 }
          : { opacity: 0, filter: 'blur(12px)', y: 14 }
      }
      animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}