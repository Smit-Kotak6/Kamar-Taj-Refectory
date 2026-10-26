import { useMemo } from 'react'
import type { Role } from '../config/navigation'
import { getDemoUser } from '../api/session'
import type { DemoUser } from '../api/session'

/** The signed-in user for a role. Mock for now; swap getDemoUser for a real session call later. */
export function useCurrentUser(role: Role): DemoUser {
  return useMemo(() => getDemoUser(role), [role])
}