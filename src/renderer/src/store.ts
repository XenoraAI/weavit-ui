import { create } from 'zustand'

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error'
/** Tabs within a selected collection. */
export type MainTab = 'data' | 'schema' | 'query' | 'rag' | 'stats' | 'tenants'
/** Instance-wide views, shown when no collection is selected. */
export type AdminView = 'overview' | 'aliases' | 'backup' | 'rbac' | 'cluster'

interface AppState {
  activeConnectionId?: string
  status: Record<string, ConnStatus>
  selectedCollection?: string
  selectedTenant?: string
  mainTab: MainTab
  adminView: AdminView

  setActiveConnection: (id?: string) => void
  setStatus: (id: string, status: ConnStatus) => void
  selectCollection: (name?: string) => void
  setSelectedTenant: (tenant?: string) => void
  setMainTab: (tab: MainTab) => void
  setAdminView: (view: AdminView) => void
}

export const useApp = create<AppState>((set) => ({
  status: {},
  mainTab: 'data',
  adminView: 'overview',

  setActiveConnection: (id) =>
    set({
      activeConnectionId: id,
      selectedCollection: undefined,
      selectedTenant: undefined,
      adminView: 'overview'
    }),
  setStatus: (id, status) => set((s) => ({ status: { ...s.status, [id]: status } })),
  selectCollection: (name) =>
    set({ selectedCollection: name, selectedTenant: undefined, mainTab: 'data' }),
  setSelectedTenant: (tenant) => set({ selectedTenant: tenant }),
  setMainTab: (tab) => set({ mainTab: tab }),
  // Choosing an instance-wide view means leaving whatever collection was open.
  setAdminView: (view) => set({ adminView: view, selectedCollection: undefined })
}))
