import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { isItemActive, splitForMobile } from '../../config/navigation'
import { useRole } from '../../context/RoleContext'

const MAX_TABS = 5
const SHEET_ID = 'mobile-more-menu'

const labelClass = (active: boolean) =>
  `text-[11px] font-medium ${active ? 'font-semibold text-ink' : 'text-ink/60'}`

const pillClass = (active: boolean) =>
  `grid h-8 w-14 place-items-center rounded-full transition-colors ${
    active ? 'bg-peach text-accent' : 'text-ink/60'
  }`

export default function MobileTabBar() {
  const { config } = useRole()
  const { pathname } = useLocation()

  // The sheet counts as open only on the page it was opened from,
  // so navigating anywhere closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const sheetOpen = openAt === pathname

  const { tabs, overflow } = splitForMobile(config.nav, MAX_TABS)
  const overflowActive = overflow.some((item) => isItemActive(item, pathname))

  useEffect(() => {
    if (!sheetOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenAt(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sheetOpen])

  return (
    <>
      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpenAt(null)}
            className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          />
          <div
            id={SHEET_ID}
            className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-line bg-card p-2 shadow-soft lg:hidden"
          >
            <ul>
              {overflow.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpenAt(null)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                          isActive ? 'bg-peach text-accent' : 'text-ink/70 hover:bg-peach/50'
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
          </div>
        </>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="flex items-stretch justify-around px-2">
          {tabs.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to} className="flex min-w-0 flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2"
                >
                  {({ isActive }) => (
                    <>
                      <span className={pillClass(isActive)}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className={`truncate ${labelClass(isActive)}`}>
                        {item.shortLabel ?? item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}

          {overflow.length > 0 && (
            <li className="flex min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={sheetOpen}
                aria-controls={SHEET_ID}
                onClick={() => setOpenAt(sheetOpen ? null : pathname)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2"
              >
                <span className={pillClass(sheetOpen || overflowActive)}>
                  <LayoutGrid className="size-5" aria-hidden="true" />
                </span>
                <span className={labelClass(sheetOpen || overflowActive)}>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  )
}