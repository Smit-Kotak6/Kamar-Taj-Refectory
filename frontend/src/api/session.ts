import type { Role } from '../config/navigation'

export interface DemoUser {
  name: string
  subtitle: string
  initials: string
}

const DEMO_USERS: Record<Role, DemoUser> = {
  student: { name: 'Rohan Verma', subtitle: 'B.Tech CSE', initials: 'RV' },
  staff: { name: 'Mess Staff', subtitle: 'Scan desk', initials: 'MS' },
  admin: { name: 'Kitchen Admin', subtitle: 'Mess office', initials: 'KA' },
}

// Mock for now. Swap the body for a real session/API call later.
export function getDemoUser(role: Role): DemoUser {
  return DEMO_USERS[role]
}