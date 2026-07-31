import { useState } from 'react'
import { AppShell } from '@mantine/core'
import type { ConnectionWithSecretFlag } from '@shared/types'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { MainArea } from './MainArea'
import { StatusBar } from './StatusBar'
import { ConnectionModal } from '../features/connections/ConnectionModal'
import { CreateCollectionModal } from '../features/schema/CreateCollectionModal'
import { CommandPalette } from '../features/palette/CommandPalette'
import { useApp } from '../store'
import { useConnect } from '../lib/useConnect'

export function App() {
  const [connModal, setConnModal] = useState<{ open: boolean; editing?: ConnectionWithSecretFlag }>({
    open: false
  })
  const [createColl, setCreateColl] = useState(false)
  const activeConnectionId = useApp((s) => s.activeConnectionId)
  const connect = useConnect()

  return (
    <>
      <AppShell
        header={{ height: 52 }}
        navbar={{ width: 300, breakpoint: 0 }}
        footer={{ height: 26 }}
        padding={0}
      >
        <AppShell.Header>
          <TopBar onNewConnection={() => setConnModal({ open: true })} />
        </AppShell.Header>
        <AppShell.Navbar>
          <Sidebar
            onNewConnection={() => setConnModal({ open: true })}
            onEditConnection={(c) => setConnModal({ open: true, editing: c })}
            onNewCollection={() => setCreateColl(true)}
          />
        </AppShell.Navbar>
        <AppShell.Main style={{ height: 'calc(100vh - 52px - 26px)', overflow: 'hidden' }}>
          <MainArea />
        </AppShell.Main>
        <AppShell.Footer>
          <StatusBar />
        </AppShell.Footer>
      </AppShell>

      <CommandPalette
        onNewConnection={() => setConnModal({ open: true })}
        onNewCollection={() => setCreateColl(true)}
      />

      {connModal.open && (
        <ConnectionModal
          opened={connModal.open}
          editing={connModal.editing}
          onClose={() => setConnModal({ open: false })}
          onSaved={(saved) => {
            setConnModal({ open: false })
            // Immediately select + connect so the user can navigate, and any
            // connection failure is surfaced right away.
            void connect(saved.id)
          }}
        />
      )}

      {createColl && activeConnectionId && (
        <CreateCollectionModal
          opened={createColl}
          connectionId={activeConnectionId}
          onClose={() => setCreateColl(false)}
        />
      )}
    </>
  )
}
