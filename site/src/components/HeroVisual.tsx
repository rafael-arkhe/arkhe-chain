import { motion, useReducedMotion } from 'motion/react'

/** Tip-extension visual — chain blocks, fail-closed admission point. */
export function HeroVisual() {
  const reduce = useReducedMotion()

  return (
    <svg
      viewBox="0 0 640 420"
      className="h-full w-full"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3d8f8a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#141a1f" stopOpacity="0" />
        </linearGradient>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="#243038"
            strokeWidth="0.5"
            opacity="0.45"
          />
        </pattern>
      </defs>
      <rect width="640" height="420" fill="url(#grid)" />
      <rect width="640" height="420" fill="url(#fade)" />

      {[
        { x: 72, y: 200, w: 88, h: 56, opacity: 0.35 },
        { x: 172, y: 188, w: 88, h: 56, opacity: 0.5 },
        { x: 272, y: 176, w: 88, h: 56, opacity: 0.65 },
        { x: 372, y: 164, w: 88, h: 56, opacity: 0.8 },
      ].map((b, i) => (
        <g key={i}>
          <motion.rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill="#141a1f"
            stroke="#3d8f8a"
            strokeWidth="1"
            opacity={b.opacity}
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: b.opacity, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          <text
            x={b.x + 12}
            y={b.y + 32}
            fill="#8a9aa6"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10"
          >
            h={i}
          </text>
        </g>
      ))}

      <motion.g
        initial={{ opacity: 0, x: reduce ? 0 : 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.55, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="488" y="148" width="104" height="72" fill="#0c0f12" stroke="#e8ecef" strokeWidth="1.5" />
        <text x="500" y="178" fill="#e8ecef" fontFamily="IBM Plex Mono, monospace" fontSize="11">
          tip
        </text>
        <text x="500" y="198" fill="#4d9e7a" fontFamily="IBM Plex Mono, monospace" fontSize="9">
          ingest
        </text>
        <path d="M 460 180 L 488 184" stroke="#3d8f8a" strokeWidth="1" strokeDasharray="4 3" />
      </motion.g>

      <text x="48" y="48" fill="#8a9aa6" fontFamily="IBM Plex Mono, monospace" fontSize="11">
        AKG:VERDICT:v1 → CBOR → ArkheNode::ingest
      </text>
    </svg>
  )
}