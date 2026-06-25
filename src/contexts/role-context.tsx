'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role } from '@/lib/auth-roles-shared'
import {
  CAN_EDIT_COST_PRICE, CAN_VIEW_PNL, CAN_EDIT_SETTINGS,
  CAN_MANAGE_USERS, CAN_RUN_SYNC, ROLE_LABELS,
} from '@/lib/auth-roles-shared'

interface RoleContextValue {
  role: Role | null
  roleLabel: string
  can: {
    editCostPrice: boolean
    viewPnl:       boolean
    editSettings:  boolean
    manageUsers:   boolean
    runSync:       boolean
  }
  loading: boolean
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  roleLabel: '',
  can: { editCostPrice: false, viewPnl: false, editSettings: false, manageUsers: false, runSync: false },
  loading: true,
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole]       = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/users/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role) setRole(d.role as Role) })
      .finally(() => setLoading(false))
  }, [])

  const value: RoleContextValue = {
    role,
    roleLabel: role ? (ROLE_LABELS[role] ?? role) : '',
    can: {
      editCostPrice: role ? CAN_EDIT_COST_PRICE.includes(role)  : false,
      viewPnl:       role ? CAN_VIEW_PNL.includes(role)         : false,
      editSettings:  role ? CAN_EDIT_SETTINGS.includes(role)    : false,
      manageUsers:   role ? CAN_MANAGE_USERS.includes(role)     : false,
      runSync:       role ? CAN_RUN_SYNC.includes(role)         : false,
    },
    loading,
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}
