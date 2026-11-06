/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export interface DashboardWSEvent {
  type: string
  payload: any
  ts: number
}

type HandlerMap = {
  usage_log_created: Set<(payload: any) => void>
  audit_log_created: Set<(payload: any) => void>
  system_instance_updated: Set<(payload: any) => void>
  system_instance_deleted: Set<(payload: any) => void>
}

interface DashboardWSContextValue {
  isConnected: boolean
  lastError: Error | null
  subscribe: (eventType: keyof HandlerMap, handler: (payload: any) => void) => () => void
}

// Singleton state (module-level, shared across all component instances)
let wsInstance: WebSocket | null = null
let wsUrl: string | null = null
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const subscribers: HandlerMap = {
  usage_log_created: new Set(),
  audit_log_created: new Set(),
  system_instance_updated: new Set(),
  system_instance_deleted: new Set(),
}
const connectionState = {
  isConnected: false,
  lastError: null as Error | null,
}
let stateUpdateCallbacks: Set<() => void> = new Set()

function notifyStateChange() {
  stateUpdateCallbacks.forEach(cb => cb())
}

function connect(token: string) {
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) {
    return
  }

  const newWsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/dashboard?token=${encodeURIComponent(token)}`
  wsUrl = newWsUrl

  console.log('[DashboardWS] Connecting to WebSocket...')
  const ws = new WebSocket(newWsUrl)
  wsInstance = ws

  ws.onopen = () => {
    console.log('[DashboardWS] WebSocket connected')
    connectionState.isConnected = true
    connectionState.lastError = null
    reconnectAttempts = 0
    notifyStateChange()
  }

  ws.onmessage = (event) => {
    try {
      const data: DashboardWSEvent = JSON.parse(event.data)
      console.log('[DashboardWS] Received message:', data.type)
      const handlers = subscribers[data.type as keyof HandlerMap]
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data.payload)
          } catch (err) {
            console.error('[DashboardWS] Handler error:', err)
          }
        })
      }
    } catch (err) {
      console.error('[DashboardWS] Failed to parse message:', err)
    }
  }

  ws.onerror = (err) => {
    console.error('[DashboardWS] WebSocket error:', err)
    connectionState.lastError = new Error('WebSocket error')
    notifyStateChange()
  }

  ws.onclose = (event) => {
    console.log('[DashboardWS] WebSocket closed:', event.code, event.reason, event.wasClean)
    connectionState.isConnected = false
    wsInstance = null
    notifyStateChange()

    if (wsUrl) {
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000)
      reconnectAttempts += 1
      console.log('[DashboardWS] Reconnecting in', delay, 'ms (attempt', reconnectAttempts, ')')
      reconnectTimeout = setTimeout(() => connect(wsUrl!.split('token=')[1]?.split('&')[0] || ''), delay)
    }
  }
}

function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  if (wsInstance) {
    wsInstance.close()
    wsInstance = null
  }
  connectionState.isConnected = false
  reconnectAttempts = 0
  wsUrl = null
  notifyStateChange()
}

function getToken(): string | null {
  return useAuthStore.getState().auth.accessToken
}

// Subscribe to events
function subscribe(eventType: keyof HandlerMap, handler: (payload: any) => void): () => void {
  subscribers[eventType].add(handler)
  return () => {
    subscribers[eventType].delete(handler)
  }
}

// Context for React components
const DashboardWSContext = createContext<DashboardWSContextValue | null>(null)

export function DashboardWSProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const token = useAuthStore((state) => state.auth.accessToken)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const cb = () => forceUpdate(n => n + 1)
    stateUpdateCallbacks.add(cb)
    return () => stateUpdateCallbacks.delete(cb)
  }, [])

  useEffect(() => {
    if (enabled && token) {
      connect(token)
    } else {
      disconnect()
    }
    return () => {
      // Don't disconnect on unmount - keep singleton alive
      // Only disconnect when explicitly disabled or token changes
    }
  }, [enabled, token])

  const value: DashboardWSContextValue = {
    isConnected: connectionState.isConnected,
    lastError: connectionState.lastError,
    subscribe,
  }

  return (
    <DashboardWSContext.Provider value={value}>
      {children}
    </DashboardWSContext.Provider>
  )
}

export function useDashboardWS() {
  const context = useContext(DashboardWSContext)
  if (!context) {
    throw new Error('useDashboardWS must be used within a DashboardWSProvider')
  }
  return context
}

// Backward compatibility hook for components that use the old API
export function useDashboardWSLegacy(options: {
  onUsageLogCreated?: (payload: any) => void
  onAuditLogCreated?: (payload: any) => void
  onSystemInstanceUpdated?: (payload: any) => void
  onSystemInstanceDeleted?: (payload: any) => void
  enabled?: boolean
} = {}) {
  const { subscribe, isConnected, lastError } = useDashboardWS()
  const handlersRef = useRef(options)

  useEffect(() => {
    handlersRef.current = options
  }, [options])

  useEffect(() => {
    const unsub1 = subscribe('usage_log_created', handlersRef.current.onUsageLogCreated)
    const unsub2 = subscribe('audit_log_created', handlersRef.current.onAuditLogCreated)
    const unsub3 = subscribe('system_instance_updated', handlersRef.current.onSystemInstanceUpdated)
    const unsub4 = subscribe('system_instance_deleted', handlersRef.current.onSystemInstanceDeleted)
    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
    }
  }, [subscribe])

  return { isConnected, lastError }
}