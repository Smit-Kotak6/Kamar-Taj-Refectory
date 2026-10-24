import { useEffect, useState } from 'react'
import { getCurrentUser, type User } from '../api/session'

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    getCurrentUser().then((u) => {
      if (active) setUser(u)
    })
    return () => {
      active = false
    }
  }, [])

  return user
}