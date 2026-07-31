import { Center, Stack, Text, Button, Alert, Image } from '@mantine/core'
import { IconPlugConnectedX } from '@tabler/icons-react'
import { useApp } from '../store'
import { ConnectionOverview } from '../features/admin/ConnectionOverview'
import { CollectionView } from '../features/schema/CollectionView'
import logo from '../assets/logo.png'

function Welcome() {
  return (
    <Center h="100%">
      <Stack align="center" gap="sm" maw={480} ta="center">
        <Image src={logo} w={76} h={76} radius="lg" />
        <Text fw={700} size="xl">
          Welcome to Weavit UI
        </Text>
        <Text c="dimmed">
          A desktop client for the Weaviate vector database. Add a connection to browse collections,
          view and edit objects, and run vector, keyword, and hybrid searches.
        </Text>
        <Text size="xs" c="dimmed" mt="md">
          Community project — not affiliated with or endorsed by Weaviate B.V.
        </Text>
      </Stack>
    </Center>
  )
}

export function MainArea() {
  const { activeConnectionId, status, selectedCollection } = useApp()
  const st = activeConnectionId ? status[activeConnectionId] : undefined

  if (!activeConnectionId) return <Welcome />

  if (st === 'error') {
    return (
      <Center h="100%">
        <Alert color="red" icon={<IconPlugConnectedX />} title="Not connected" maw={520}>
          Could not connect to this instance. Check the host/port, gRPC settings, and credentials,
          then select the connection again to retry.
        </Alert>
      </Center>
    )
  }

  if (st !== 'connected') {
    return (
      <Center h="100%">
        <Stack align="center">
          <Text c="dimmed">Select a connection in the sidebar to connect.</Text>
          <Button variant="light" disabled>
            Connecting…
          </Button>
        </Stack>
      </Center>
    )
  }

  if (!selectedCollection) return <ConnectionOverview connectionId={activeConnectionId} />

  return <CollectionView connectionId={activeConnectionId} collection={selectedCollection} />
}
