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
import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export interface DashboardWSEvent {
  type: string
  payload: any
  ts: number
}

export interface UseDashboardWSOptions {
  onUsageLogCreated?: (payload: any) => void
  onAuditLogCreated?: (payload: any) => void
  onSystemInstanceUpdated?: (payload: any) => void
  onSystemInstanceDeleted?: (payload: any) => void
  enabled?: boolean
}

export function useDashboardWS(options: UseDashboardWSOptions = {}) {
  const {
    onUsageLogCreated,
    onAuditLogCreated,
    onSystemInstanceUpdated,
    onSystemInstanceDeleted,
    enabled = true,
  } = options

  const token = useAuthStore((state) => state.auth.token)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const reconnectAttempts = useRef(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastError, setLastError] = useState<Error | null>(null)

  const handlersRef = useRef({
    onUsageLogCreated,
    onAuditLogCreated,
    onSystemInstanceUpdated,
    onSystemInstanceDeleted,
  })

  // Update handlers ref when they change
  useEffect(() => {
    handlersRef.current = {
      onUsageLogCreated,
      onAuditLogCreated,
      onSystemInstanceUpdated,
      onSystemInstanceDeleted,
    }
  }, [onUsageLogCreated, onAuditLogCreated, onSystemInstanceUpdated, onSystemInstanceDeleted])

  const connect = useCallback(() => {
    if (!enabled || !token) return

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/dashboard`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setLastError(null)
      reconnectAttempts.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const data: DashboardWSEvent = JSON.parse(event.data)
        switch (data.type) {
          case 'usage_log_created':
            handlersRef.current.onUsageLogCreated?.(data.payload)
            break
          case 'audit_log_created':
            handlersRef.current.onAuditLogCreated?.(data.payload)
            break
          case 'system_instance_updated':
            handlersRef.current.onSystemInstanceUpdated?.(data.payload)
            break
          case 'system_instance_deleted':
            handlersRef.current.onSystemInstanceDeleted?.(data.payload)
            break
        }
      } catch (err) {
        console.error('Failed to parse dashboard WS message:', err)
      }
    }

    ws.onerror = (err) => {
      setLastError(new Error('WebSocket error'))
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null

      if (enabled && token) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000)
        reconnectAttempts.current += 1
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
    }
  }, [enabled, token])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  useEffect(() => {
    if (enabled && token) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, token, connect, disconnect])

  return { isConnected, lastError, reconnect: connect }
}