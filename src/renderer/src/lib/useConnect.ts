import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { notifyErr } from './notify'
import { useApp } from '../store'

// Selects a connection as active and attempts to connect, updating status and
// surfacing any failure. Shared by the sidebar and the connection modal so both
// give identical feedback. Returns true on success.
export function useConnect() {
  const qc = useQueryClient()
  const setActiveConnection = useApp((s) => s.setActiveConnection)
  const setStatus = useApp((s) => s.setStatus)

  const clearCache = (id: string) => {
    qc.removeQueries({ queryKey: ['collections', id] })
    qc.removeQueries({ queryKey: ['meta', id] })
    qc.removeQueries({ queryKey: ['nodes', id] })
  }

  return async (id: string): Promise<boolean> => {
    setActiveConnection(id)
    setStatus(id, 'connecting')
    try {
      const res = await api.connections.connect(id)
      if (res.ok) {
        setStatus(id, 'connected')
        return true
      }
      // Connection dropped/failed — drop any stale schema data so we don't keep
      // showing collections from a previous successful session.
      setStatus(id, 'error')
      clearCache(id)
      notifyErr(res.error, 'Connection failed')
      return false
    } catch (e) {
      setStatus(id, 'error')
      clearCache(id)
      notifyErr(e, 'Connection failed')
      return false
    }
  }
}
