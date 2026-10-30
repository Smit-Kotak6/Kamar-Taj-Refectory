import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Search } from 'lucide-react'
import { getNotifications } from '../../api'
import { useRole } from '../../context/RoleContext'
import Logo from './Logo'

export default function TopBar() {
  const { config, user, logout } = useRole()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!config.notificationsPath) return
    let active = true
    const refresh = () => { void getNotifications().then(items => {
      if (active) setUnread(items.filter(item => !item.read).length)
    }).catch(() => {}) }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [config.notificationsPath, location.pathname])

  async function signOut() {
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
        <Link to={config.home} aria-label="Kamar-Taj home" className="shrink-0 lg:hidden">
          <Logo showWordmark={false} />
        </Link>

        <div className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink/40"
            aria-hidden="true"
          />
          <input
            type="search"
            disabled
            aria-label="Search coming soon"
            placeholder={config.searchPlaceholder}
            className="h-11 w-full rounded-full border border-line bg-card pl-12 pr-4 text-sm text-ink shadow-soft placeholder:text-ink/50 disabled:opacity-70"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {config.notificationsPath && (
            <Link
              to={config.notificationsPath}
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative grid size-11 place-items-center rounded-full border border-line bg-card text-ink shadow-soft"
            >
              <Bell className="size-5" />
              {unread > 0 ? <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] text-white">{unread > 9 ? '9+' : unread}</span> : null}
            </Link>
          )}
          <span className="hidden text-sm font-semibold sm:inline">{user.name}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-card px-3 shadow-soft"
            aria-label="Log out"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
