import {
  Bell,
  CalendarDays,
  CalendarOff,
  DoorClosed,
  FileText,
  House,
  LayoutDashboard,
  Leaf,
  QrCode,
  ScanLine,
  SlidersHorizontal,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'student' | 'staff' | 'admin'

export interface NavItem {
  label: string
  shortLabel?: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export interface RoleConfig {
  label: string
  blurb: string
  home: string
  searchPlaceholder: string
  notificationsPath: string | null
  nav: NavItem[]
}

export const ROLES: Role[] = ['student', 'staff', 'admin']

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  student: {
    label: 'Student',
    blurb: 'Meals, leave, QR and billing',
    home: '/student',
    searchPlaceholder: 'Search menu, meals…',
    notificationsPath: '/student/notifications',
    nav: [
      { label: 'Home', to: '/student', icon: House, end: true },
      { label: 'My Meals', to: '/student/meals', icon: UtensilsCrossed },
      { label: 'My QR', to: '/student/qr', icon: QrCode },
      { label: 'Leave', to: '/student/leave', icon: CalendarOff },
      { label: 'Preferences', to: '/student/preferences', icon: SlidersHorizontal },
      { label: 'Billing', to: '/student/billing', icon: Wallet },
      { label: 'Notifications', to: '/student/notifications', icon: Bell },
    ],
  },
  staff: {
    label: 'Staff',
    blurb: 'Scan meal QR codes',
    home: '/staff/scan',
    searchPlaceholder: 'Search students…',
    notificationsPath: null,
    nav: [{ label: 'Scan', to: '/staff/scan', icon: ScanLine }],
  },
  admin: {
    label: 'Admin',
    blurb: 'Planning, forecast and reports',
    home: '/admin',
    searchPlaceholder: 'Search meals, inventory, students…',
    notificationsPath: null,
    nav: [
      { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
      { label: 'Meal Planning', shortLabel: 'Planning', to: '/admin/planning', icon: CalendarDays },
      { label: 'Closures', to: '/admin/closures', icon: DoorClosed },
      { label: 'Demand Forecast', shortLabel: 'Forecast', to: '/admin/forecast', icon: TrendingUp },
      { label: 'Waste & Sustainability', shortLabel: 'Waste', to: '/admin/waste', icon: Leaf },
      { label: 'Reports', to: '/admin/reports', icon: FileText },
    ],
  },
}

export function roleFromPath(pathname: string): Role {
  const segment = pathname.split('/')[1]
  if (segment === 'staff') return 'staff'
  if (segment === 'admin') return 'admin'
  return 'student'
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`)
}

/** Mobile shows up to `max` slots; extra items move behind a "More" tab. */
export function splitForMobile(items: NavItem[], max: number) {
  if (items.length <= max) return { tabs: items, overflow: [] as NavItem[] }
  return { tabs: items.slice(0, max - 1), overflow: items.slice(max - 1) }
}