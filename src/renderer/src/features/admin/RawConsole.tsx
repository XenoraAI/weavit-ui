import { useState } from 'react'
import { Tabs, Stack, Group, Button, Select, TextInput, Text, Badge } from '@mantine/core'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import type { RawResponse, RawRestRequest } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr } from '../../lib/notify'
import { CodeEditor } from '../../components/CodeEditor'
import { JsonView } from '../../components/JsonView'

const DEFAULT_GQL = `{
  Get {
    # YourCollection(limit: 2) { _additional { id } }
  }
}`

export function RawConsole({ connectionId }: { connectionId: string }) {
  const [gql, setGql] = useState(DEFAULT_GQL)
  const [method, setMethod] = useState<RawRestRequest['method']>('GET')
  const [path, setPath] = useState('/v1/meta')
  const [body, setBody] = useState('')

  const graphql = useMutation<RawResponse, Error>({
    mutationFn: () => api.query.rawGraphQL({ connectionId, query: gql }),
    onError: (e) => notifyErr(e, 'GraphQL request failed')
  })
  const rest = useMutation<RawResponse, Error>({
    mutationFn: () =>
      api.query.rawRest({ connectionId, method, path, body: body.trim() || undefined }),
    onError: (e) => notifyErr(e, 'REST request failed')
  })

  return (
    <Tabs defaultValue="graphql">
      <Tabs.List mb="sm">
        <Tabs.Tab value="graphql">GraphQL</Tabs.Tab>
        <Tabs.Tab value="rest">REST</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="graphql">
        <Stack gap="sm">
          <CodeEditor value={gql} onChange={setGql} height="220px" />
          <Group justify="flex-end">
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              loading={graphql.isPending}
              onClick={() => graphql.mutate()}
            >
              Run
            </Button>
          </Group>
          {graphql.data && (
            <>
              <Group gap="xs">
                <Badge color={graphql.data.ok ? 'teal' : 'red'}>HTTP {graphql.data.status}</Badge>
              </Group>
              <JsonView value={graphql.data.data} maxHeight={360} />
            </>
          )}
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="rest">
        <Stack gap="sm">
          <Group align="end">
            <Select
              label="Method"
              w={110}
              data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}
              value={method}
              onChange={(v) => setMethod((v as RawRestRequest['method']) ?? 'GET')}
            />
            <TextInput
              label="Path"
              placeholder="/v1/meta"
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconPlayerPlay size={14} />}
              loading={rest.isPending}
              onClick={() => rest.mutate()}
            >
              Send
            </Button>
          </Group>
          {method !== 'GET' && (
            <div>
              <Text size="sm" fw={500} mb={4}>
                Body (JSON)
              </Text>
              <CodeEditor value={body} onChange={setBody} height="160px" />
            </div>
          )}
          {rest.data && (
            <>
              <Group gap="xs">
                <Badge color={rest.data.ok ? 'teal' : 'red'}>HTTP {rest.data.status}</Badge>
              </Group>
              <JsonView value={rest.data.data} maxHeight={360} />
            </>
          )}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  )
}
