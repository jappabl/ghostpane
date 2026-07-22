// Minimal line icons (lucide-style, 1.5px stroke, 16px) — no dependency.
type P = { size?: number }
const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
})

export function CameraIcon({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M14.5 4h-5L8 6H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-4l-1.5-2Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

export function SendIcon({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 12h13" />
      <path d="M12 6l6 6-6 6" />
    </svg>
  )
}

export function EyeOffIcon({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M2 2l20 20" />
      <path d="M6.7 6.7C4.6 8 3 10 2 12c1.7 3.5 5.5 6 10 6 1.7 0 3.3-.4 4.7-1" />
      <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c4.5 0 8.3 2.5 10 6-.6 1.2-1.4 2.3-2.4 3.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
