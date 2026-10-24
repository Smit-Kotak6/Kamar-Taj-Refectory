import { useId } from 'react'

interface LogoProps {
  showWordmark?: boolean
}

export default function Logo({ showWordmark = true }: LogoProps) {
  const gradientId = `logo-gradient-${useId().replace(/:/g, '')}`
  const stroke = `url(#${gradientId})`

  return (
    <span className="flex items-center gap-3">
      <svg viewBox="0 0 40 44" fill="none" aria-hidden="true" className="h-10 w-9 shrink-0">
        <defs>
          <linearGradient
            id={gradientId}
            x1="4"
            y1="2"
            x2="36"
            y2="42"
            gradientUnits="userSpaceOnUse"
          >
            <stop style={{ stopColor: 'var(--color-brand-orange)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--color-brand-pink)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-brand-purple)' }} />
          </linearGradient>
        </defs>
        <path
          d="M5 42V19C5 10 11 4 20 2c9 2 15 8 15 17v23"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 42V21c0-5 3-9 8-10.5 5 1.5 8 5.5 8 10.5v21"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M20 22l1.6 3.4 3.4 1.6-3.4 1.6L20 32l-1.6-3.4L15 27l3.4-1.6z" fill={stroke} />
        <path d="M2 42h36" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {showWordmark && (
        <span className="leading-none">
          <span className="block font-serif text-[1.35rem] font-bold text-ink">Kamar-Taj</span>
          <span className="mt-1 block font-serif text-sm font-semibold text-ink/70">
            Refectory
          </span>
        </span>
      )}
    </span>
  )
}