import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, ChevronDown, Search } from 'lucide-react'
import { ROLES, ROLE_CONFIG, type Role } from '../../config/navigation'
import { useRole } from '../../context/RoleContext'
import Logo from './Logo'

const bellClass =
  'relative grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink shadow-soft transition-colors hover:bg-peach/60'

export default function TopBar() {
  const { role, config, user, switchRole } = useRole()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const handleSelectRole = (next: Role) => {
    setMenuOpen(false)
    switchRole(next)
  }

  const bellContent = (
    <>
      <Bell className="size-5" aria-hidden="true" />
      <span
        aria-hidden="true"
        className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-danger ring-2 ring-card"
      />
    </>
  )

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
        {/* Mobile: logo mark only (sidebar is hidden) */}
        <Link
          to={config.home}
          aria-label="Kamar-Taj Refectory home"
          className="shrink-0 lg:hidden"
        >
          <Logo showWordmark={false} />
        </Link>

        <div role="search" className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink/40"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search"
            placeholder={config.searchPlaceholder}
            className="h-11 w-full rounded-full border border-line bg-card pl-12 pr-4 text-sm text-ink shadow-soft placeholder:text-ink/50"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {config.notificationsPath ? (
            <Link
              to={config.notificationsPath}
              aria-label="Notifications, new items"
              className={bellClass}
            >
              {bellContent}
            </Link>
          ) : (
            <button type="button" aria-label="Notifications, new items" className={bellClass}>
              {bellContent}
            </button>
          )}

          <div ref={menuRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={`Account menu for ${user.name}`}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 items-center gap-2 rounded-full border border-line bg-card pl-1 pr-3 shadow-soft transition-colors hover:bg-peach/40"
            >
              <span className="grid size-9 place-items-center rounded-full bg-brand-purple text-xs font-semibold text-white">
                {user.initials}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold text-ink">{user.name}</span>
                <span className="block text-xs text-ink/60">{user.subtitle}</span>
              </span>
              <ChevronDown
                className={`size-4 text-ink/60 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                id={menuId}
                className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-card p-2 shadow-soft"
              >
                <div className="px-3 pb-3 pt-2">
                  <p className="text-sm font-semibold text-ink">{user.name}</p>
                  <p className="text-xs text-ink/60">{user.subtitle}</p>
                </div>

                <div className="border-t border-line pt-2">
                  <p className="px-3 pb-1 text-xs font-medium text-ink/60">
                    Switch demo role
                  </p>
                  <ul>
                    {ROLES.map((roleKey) => {
                      const option = ROLE_CONFIG[roleKey]
                      const selected = roleKey === role
                      return (
                        <li key={roleKey}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => handleSelectRole(roleKey)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                              selected ? 'bg-peach' : 'hover:bg-peach/50'
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-ink">
                                {option.label}
                              </span>
                              <span className="block text-xs text-ink/60">{option.blurb}</span>
                            </span>
                            {selected && (
                              <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}