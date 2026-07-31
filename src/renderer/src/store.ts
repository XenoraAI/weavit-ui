import { create } from 'zustand'

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type MainTab = 'data' | 'schema' | 'query'

interface AppState {
  activeConnectionId?: string
  status: Record<string, ConnStatus>
  selectedCollection?: string
  selectedTenant?: string
  mainTab: MainTab

  setActiveConnection: (id?: string) => void
  setStatus: (id: string, status: ConnStatus) => void
  selectCollection: (name?: string) => void
  setSelectedTenant: (tenant?: string) => void
  setMainTab: (tab: MainTab) => void
}

export const useApp = create<AppState>((set) => ({
  status: {},
  mainTab: 'data',

  setActiveConnection: (id) =>
    set({ activeConnectionId: id, selectedCollection: undefined, selectedTenant: undefined }),
  setStatus: (id, status) => set((s) => ({ status: { ...s.status, [id]: status } })),
  selectCollection: (name) =>
    set({ selectedCollection: name, selectedTenant: undefined, mainTab: 'data' }),
  setSelectedTenant: (tenant) => set({ selectedTenant: tenant }),
  setMainTab: (tab) => set({ mainTab: tab })
}))
