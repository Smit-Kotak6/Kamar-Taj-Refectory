import { Link, NavLink } from 'react-router-dom'
import { useRole } from '../../context/RoleContext'
import Logo from './Logo'

export default function Sidebar() {
  const { config } = useRole()

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-cream lg:flex">
      <div className="shrink-0 px-6 pb-6 pt-7">
        <Link to={config.home} aria-label="Kamar-Taj Refectory home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-4">
        <ul className="space-y-1">
          {config.nav.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-peach text-accent'
                        : 'text-ink/70 hover:bg-peach/50 hover:text-ink'
                    }`
                  }
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Illustrated card (gradient placeholder, swap for artwork later) */}
      <div className="shrink-0 p-4">
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-b from-brand-orange via-brand-pink to-brand-purple px-5 pb-5 pt-28 text-white shadow-soft">
          <span
            aria-hidden="true"
            className="absolute right-5 top-5 size-14 rounded-full bg-white/30"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 220 110"
            preserveAspectRatio="xMidYMax slice"
            fill="white"
            className="absolute inset-x-0 top-0 h-28 w-full"
          >
            <path d="M10 110V70a22 22 0 0 1 44 0v40Z" opacity=".18" />
            <path d="M70 110V50a30 30 0 0 1 60 0v60Z" opacity=".25" />
            <path d="M150 110V74a20 20 0 0 1 40 0v36Z" opacity=".18" />
          </svg>
          <p className="relative font-serif text-xl font-bold leading-snug">
            Good Food, Brighter Minds
          </p>
        </div>
      </div>
    </aside>
  )
}