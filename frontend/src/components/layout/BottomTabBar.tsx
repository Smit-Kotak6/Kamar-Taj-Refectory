import { NavLink } from 'react-router-dom'
import type { NavItem } from '../../config/navigation'

export default function BottomTabBar({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-w-16 flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium ${
              isActive ? 'text-gold' : 'text-slate-400'
            }`
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}