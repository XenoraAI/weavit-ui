import { useState } from 'react'
import {
  Modal,
  TextInput,
  NumberInput,
  SegmentedControl,
  Switch,
  PasswordInput,
  Button,
  Group,
  Stack,
  Select,
  Textarea,
  Divider,
  Text,
  ColorSwatch,
  Tooltip,
  Accordion,
  TagsInput
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import type { ConnectionConfig, ConnectionType, AuthType, ConnectionWithSecretFlag } from '@shared/types'
import { api } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { ENV_COLORS, DEFAULT_ENV_COLOR } from '../../lib/colors'

interface Props {
  opened: boolean
  onClose: () => void
  onSaved: (c: ConnectionWithSecretFlag) => void
  editing?: ConnectionWithSecretFlag
}

type FormState = Partial<ConnectionConfig> & { headersText?: string }

function initial(editing?: ConnectionWithSecretFlag): FormState {
  if (editing) return { ...editing, headersText: editing.headers ? JSON.stringify(editing.headers, null, 2) : '' }
  return {
    name: '',
    type: 'local',
    authType: 'none',
    color: DEFAULT_ENV_COLOR,
    localHost: 'localhost',
    localPort: 8080,
    localGrpcPort: 50051,
    httpPort: 8080,
    grpcPort: 50051,
    httpSecure: false,
    grpcSecure: false
  }
}

export function ConnectionModal({ opened, onClose, onSaved, editing }: Props) {
  const qc = useQueryClient()
  const [f, setF] = useState<FormState>(() => initial(editing))
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      let headers: Record<string, string> | undefined
      if (f.headersText && f.headersText.trim()) {
        headers = JSON.parse(f.headersText)
      }
      const config: ConnectionConfig = {
        id: editing?.id ?? '',
        name: f.name?.trim() || 'Untitled',
        type: (f.type as ConnectionType) ?? 'local',
        authType: (f.authType as AuthType) ?? 'none',
        color: f.color ?? DEFAULT_ENV_COLOR,
        headers,
        localHost: f.localHost,
        localPort: f.localPort,
        localGrpcPort: f.localGrpcPort,
        clusterUrl: f.clusterUrl,
        httpHost: f.httpHost,
        httpPort: f.httpPort,
        httpSecure: f.httpSecure,
        grpcHost: f.grpcHost,
        grpcPort: f.grpcPort,
        grpcSecure: f.grpcSecure,
        oidcUsername: f.oidcUsername,
        oidcClientId: f.oidcClientId,
        oidcScopes: f.oidcScopes,
        timeout: f.timeout,
        proxies: f.proxies,
        skipInitChecks: f.skipInitChecks
      }
      // The single stored secret means something different per auth method, so
      // any authenticated method can supply one.
      // undefined => keep existing; null => clear; string => set.
      let secretArg: string | null | undefined
      if (config.authType === 'none') secretArg = null
      else if (apiKey) secretArg = apiKey
      else secretArg = editing?.hasApiKey ? undefined : null

      const saved = await api.connections.upsert(config, secretArg)
      // Refresh the sidebar list so the new/edited connection shows up.
      await qc.invalidateQueries({ queryKey: ['connections'] })
      // Editing credentials can mean connecting as a different user entirely.
      await qc.invalidateQueries({ queryKey: ['capabilities', saved.id] })
      notifyOk('Connection saved')
      onClose()
      onSaved(saved)
    } catch (e) {
      notifyErr(e, 'Could not save connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit connection' : 'New connection'} size="lg">
      <Stack>
        <TextInput
          label="Name"
          placeholder="Local Weaviate"
          value={f.name ?? ''}
          onChange={(e) => set({ name: e.currentTarget.value })}
          data-autofocus
        />

        <div>
          <Text size="sm" fw={500} mb={6}>
            Environment color
          </Text>
          <Group gap="xs">
            {ENV_COLORS.map((c) => {
              const selected = (f.color ?? DEFAULT_ENV_COLOR) === c.hex
              return (
                <Tooltip key={c.hex} label={c.name} withArrow>
                  <ColorSwatch
                    color={c.hex}
                    size={26}
                    style={{ cursor: 'pointer', outline: selected ? `2px solid ${c.hex}` : 'none', outlineOffset: 2 }}
                    onClick={() => set({ color: c.hex })}
                  >
                    {selected && <IconCheck size={15} color="#fff" />}
                  </ColorSwatch>
                </Tooltip>
              )
            })}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Shown in the sidebar and status bar so you always know which instance you're on.
          </Text>
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>Connection type</Text>
          <SegmentedControl
            fullWidth
            value={f.type}
            onChange={(v) => set({ type: v as ConnectionType })}
            data={[
              { label: 'Local', value: 'local' },
              { label: 'Weaviate Cloud', value: 'cloud' },
              { label: 'Custom', value: 'custom' }
            ]}
          />
        </div>

        {f.type === 'local' && (
          <Stack gap={4}>
            <Group grow align="end">
              <TextInput label="Host" value={f.localHost ?? ''} onChange={(e) => set({ localHost: e.currentTarget.value })} />
              <NumberInput label="HTTP port" value={f.localPort} onChange={(v) => set({ localPort: Number(v) })} />
              <NumberInput label="gRPC port" value={f.localGrpcPort} onChange={(v) => set({ localGrpcPort: Number(v) })} />
            </Group>
            <Text size="xs" c="dimmed">
              Weavit UI uses HTTP for schema and gRPC for data — both must reach the same instance. Over an
              SSH tunnel, set gRPC port to the forwarded gRPC port (e.g. 28051), not the default 50051.
            </Text>
          </Stack>
        )}

        {f.type === 'cloud' && (
          <TextInput
            label="Cluster URL"
            placeholder="https://my-cluster.c0.region.gcp.weaviate.cloud"
            value={f.clusterUrl ?? ''}
            onChange={(e) => set({ clusterUrl: e.currentTarget.value })}
          />
        )}

        {f.type === 'custom' && (
          <Stack gap="xs">
            <Group grow align="end">
              <TextInput label="HTTP host" value={f.httpHost ?? ''} onChange={(e) => set({ httpHost: e.currentTarget.value })} />
              <NumberInput label="HTTP port" value={f.httpPort} onChange={(v) => set({ httpPort: Number(v) })} />
              <Switch label="HTTPS" checked={!!f.httpSecure} onChange={(e) => set({ httpSecure: e.currentTarget.checked })} mt={22} />
            </Group>
            <Group grow align="end">
              <TextInput label="gRPC host" value={f.grpcHost ?? ''} onChange={(e) => set({ grpcHost: e.currentTarget.value })} />
              <NumberInput label="gRPC port" value={f.grpcPort} onChange={(v) => set({ grpcPort: Number(v) })} />
              <Switch label="gRPC TLS" checked={!!f.grpcSecure} onChange={(e) => set({ grpcSecure: e.currentTarget.checked })} mt={22} />
            </Group>
          </Stack>
        )}

        <Divider label="Authentication" labelPosition="left" />
        <Select
          label="Auth method"
          value={f.authType}
          onChange={(v) => set({ authType: (v as AuthType) ?? 'none' })}
          data={[
            { label: 'None (anonymous)', value: 'none' },
            { label: 'API key', value: 'apiKey' },
            { label: 'OIDC — username & password', value: 'oidcPassword' },
            { label: 'OIDC — client credentials', value: 'oidcClientCredentials' },
            { label: 'OIDC — access token', value: 'oidcToken' }
          ]}
        />
        {f.authType === 'apiKey' && (
          <PasswordInput
            label="API key"
            placeholder={editing?.hasApiKey ? '•••••••• (stored — leave blank to keep)' : 'weaviate api key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
          />
        )}
        {f.authType === 'oidcPassword' && (
          <>
            <TextInput
              label="Username"
              value={f.oidcUsername ?? ''}
              onChange={(e) => set({ oidcUsername: e.currentTarget.value })}
            />
            <PasswordInput
              label="Password"
              placeholder={editing?.hasApiKey ? '•••••••• (stored — leave blank to keep)' : ''}
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          </>
        )}
        {f.authType === 'oidcClientCredentials' && (
          <>
            <TextInput
              label="Client ID"
              description="Optional — many providers infer it from the secret"
              value={f.oidcClientId ?? ''}
              onChange={(e) => set({ oidcClientId: e.currentTarget.value })}
            />
            <PasswordInput
              label="Client secret"
              placeholder={editing?.hasApiKey ? '•••••••• (stored — leave blank to keep)' : ''}
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          </>
        )}
        {f.authType === 'oidcToken' && (
          <PasswordInput
            label="Access token"
            description="A bearer token. It is not refreshed, so it expires with the token."
            placeholder={editing?.hasApiKey ? '•••••••• (stored — leave blank to keep)' : ''}
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
          />
        )}
        {(f.authType === 'oidcPassword' || f.authType === 'oidcClientCredentials') && (
          <TagsInput
            label="Scopes (optional)"
            description="Press Enter after each scope"
            value={f.oidcScopes ?? []}
            onChange={(v) => set({ oidcScopes: v })}
          />
        )}

        <Textarea
          label="Extra HTTP headers (JSON, optional)"
          description="e.g. third-party vectorizer keys like X-OpenAI-Api-Key"
          placeholder='{ "X-OpenAI-Api-Key": "sk-..." }'
          autosize
          minRows={2}
          value={f.headersText ?? ''}
          onChange={(e) => set({ headersText: e.currentTarget.value })}
        />

        <Accordion variant="separated" chevronPosition="left">
          <Accordion.Item value="advanced">
            <Accordion.Control>
              <Text size="sm">Timeouts &amp; proxy</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group grow>
                  <NumberInput
                    size="xs"
                    label="Init (s)"
                    placeholder="2"
                    min={1}
                    value={f.timeout?.init ?? ''}
                    onChange={(v) =>
                      set({ timeout: { ...f.timeout, init: v === '' ? undefined : Number(v) } })
                    }
                  />
                  <NumberInput
                    size="xs"
                    label="Query (s)"
                    placeholder="30"
                    min={1}
                    value={f.timeout?.query ?? ''}
                    onChange={(v) =>
                      set({ timeout: { ...f.timeout, query: v === '' ? undefined : Number(v) } })
                    }
                  />
                  <NumberInput
                    size="xs"
                    label="Insert (s)"
                    placeholder="90"
                    min={1}
                    value={f.timeout?.insert ?? ''}
                    onChange={(v) =>
                      set({ timeout: { ...f.timeout, insert: v === '' ? undefined : Number(v) } })
                    }
                  />
                </Group>
                <TextInput
                  size="xs"
                  label="gRPC proxy URL"
                  description="Only tunnelling gRPC proxies are supported; for HTTP, point the host at the proxy instead."
                  placeholder="http://proxy.internal:8080"
                  value={f.proxies?.grpc ?? ''}
                  onChange={(e) => set({ proxies: { grpc: e.currentTarget.value || undefined } })}
                />
                <Switch
                  size="xs"
                  label="Skip startup health checks"
                  description="Connect faster against instances that don't expose /v1/meta readiness"
                  checked={!!f.skipInitChecks}
                  onChange={(e) => set({ skipInitChecks: e.currentTarget.checked })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
