import { Spotlight, type SpotlightActionData, type SpotlightActionGroupData } from '@mantine/spotlight'
import {
  IconDatabase,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconSearch
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { connColor } from '../../lib/colors'
import { useApp, type MainTab } from '../../store'
import { useConnect } from '../../lib/useConnect'

interface Props {
  onNewConnection: () => void
  onNewCollection: () => void
}

// ⌘K palette: fuzzy-jump to any collection, switch connections, or run a quick
// action. The fastest path through a cluster with dozens of collections.
export function CommandPalette({ onNewConnection, onNewCollection }: Props) {
  const qc = useQueryClient()
  const { activeConnectionId, status } = useApp()
  const selectCollection = useApp((s) => s.selectCollection)
  const setMainTab = useApp((s) => s.setMainTab)
  const connect = useConnect()

  const connections = useQuery({ queryKey: ['connections'], queryFn: () => api.connections.list() })

  const connected = activeConnectionId && status[activeConnectionId] === 'connected'
  const collections = useQuery({
    queryKey: ['collections', activeConnectionId],
    queryFn: () => api.schema.listCollections(activeConnectionId!),
    enabled: !!connected
  })

  const openCollection = (name: string, tab: MainTab) => {
    selectCollection(name)
    setMainTab(tab)
  }

  const groups: SpotlightActionGroupData[] = []

  if (connected && (collections.data?.length ?? 0) > 0) {
    const actions: SpotlightActionData[] = []
    for (const c of collections.data!) {
      actions.push({
        id: `open-${c.name}`,
        label: c.name,
        description: `${c.propertyCount} properties${c.multiTenancyEnabled ? ' · multi-tenant' : ''}`,
        leftSection: <IconDatabase size={18} />,
        onClick: () => openCollection(c.name, 'data')
      })
    }
    groups.push({ group: 'Collections', actions })
  }

  const connActions: SpotlightActionData[] = (connections.data ?? []).map((c) => ({
    id: `conn-${c.id}`,
    label: c.name,
    description: c.id === activeConnectionId ? 'Active connection' : `Connect · ${c.type}`,
    leftSection: <IconPlugConnected size={18} color={connColor(c.color)} />,
    onClick: () => void connect(c.id)
  }))
  if (connActions.length) groups.push({ group: 'Connections', actions: connActions })

  const quick: SpotlightActionData[] = []
  if (connected) {
    quick.push({
      id: 'refresh',
      label: 'Refresh collections',
      leftSection: <IconRefresh size={18} />,
      onClick: () => qc.invalidateQueries({ queryKey: ['collections', activeConnectionId] })
    })
    quick.push({
      id: 'new-collection',
      label: 'New collection',
      leftSection: <IconPlus size={18} />,
      onClick: onNewCollection
    })
  }
  quick.push({
    id: 'new-connection',
    label: 'New connection',
    leftSection: <IconPlus size={18} />,
    onClick: onNewConnection
  })
  groups.push({ group: 'Actions', actions: quick })

  return (
    <Spotlight
      actions={groups}
      shortcut={['mod + K', 'mod + P']}
      nothingFound="No matches"
      highlightQuery
      scrollable
      maxHeight={440}
      searchProps={{
        leftSection: <IconSearch size={18} />,
        placeholder: 'Search collections and actions…'
      }}
    />
  )
}
