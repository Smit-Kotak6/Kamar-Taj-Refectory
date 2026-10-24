import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDemoUser, type DemoUser } from '../api/session'
import { ROLE_CONFIG, roleFromPath, type Role, type RoleConfig } from '../config/navigation'

interface RoleContextValue {
  role: Role
  config: RoleConfig
  user: DemoUser
  switchRole: (role: Role) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Role is derived from the URL, so refresh and the back button never
  // leave the sidebar showing the wrong role's items.
  const role = roleFromPath(pathname)

  const switchRole = useCallback(
    (next: Role) => navigate(ROLE_CONFIG[next].home),
    [navigate],
  )

  const value = useMemo<RoleContextValue>(
    () => ({ role, config: ROLE_CONFIG[role], user: getDemoUser(role), switchRole }),
    [role, switchRole],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRole(): RoleContextValue {
  const context = useContext(RoleContext)
  if (!context) throw new Error('useRole must be used inside <RoleProvider>')
  return context
}