import { Stack, Group, Select, TextInput, Checkbox, ActionIcon, Button, Text } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { PermissionInput } from '@shared/types'

// Weaviate's permission model is resource + verbs + a scope. Each resource
// supports a different set of verbs and a different scope field, so the editor
// is driven by this table rather than by a single generic form.

interface ResourceSpec {
  value: string
  label: string
  verbs: { key: string; label: string }[]
  /** Which scope inputs this resource takes. */
  scope: ('collection' | 'tenant' | 'alias' | 'role' | 'user' | 'group')[]
}

const CRUD = [
  { key: 'create', label: 'create' },
  { key: 'read', label: 'read' },
  { key: 'update', label: 'update' },
  { key: 'delete', label: 'delete' }
]

export const RESOURCES: ResourceSpec[] = [
  { value: 'collections', label: 'Collections', verbs: CRUD, scope: ['collection'] },
  { value: 'data', label: 'Objects (data)', verbs: CRUD, scope: ['collection', 'tenant'] },
  { value: 'tenants', label: 'Tenants', verbs: CRUD, scope: ['collection', 'tenant'] },
  { value: 'aliases', label: 'Aliases', verbs: CRUD, scope: ['alias', 'collection'] },
  {
    value: 'backups',
    label: 'Backups',
    verbs: [{ key: 'manage', label: 'manage' }],
    scope: ['collection']
  },
  {
    value: 'cluster',
    label: 'Cluster',
    verbs: [{ key: 'read', label: 'read' }],
    scope: []
  },
  {
    value: 'nodes',
    label: 'Nodes',
    verbs: [{ key: 'read', label: 'read' }],
    scope: ['collection']
  },
  { value: 'replicate', label: 'Shard replication', verbs: CRUD, scope: ['collection'] },
  { value: 'roles', label: 'Roles', verbs: CRUD, scope: ['role'] },
  {
    value: 'users',
    label: 'Users',
    verbs: [
      { key: 'read', label: 'read' },
      { key: 'assign', label: 'assign & revoke' }
    ],
    scope: ['user']
  },
  {
    value: 'groups',
    label: 'OIDC groups',
    verbs: [
      { key: 'read', label: 'read' },
      { key: 'assign', label: 'assign & revoke' }
    ],
    scope: ['group']
  },
  {
    value: 'mcp',
    label: 'MCP',
    verbs: [
      { key: 'create', label: 'create' },
      { key: 'read', label: 'read' },
      { key: 'update', label: 'update' }
    ],
    scope: []
  }
]

export function emptyPermission(): PermissionInput {
  return { resource: 'data', actions: { read: true }, collection: '*', tenant: '*' }
}

interface Props {
  value: PermissionInput[]
  onChange: (v: PermissionInput[]) => void
}

export function PermissionEditor({ value, onChange }: Props) {
  const update = (i: number, patch: Partial<PermissionInput>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Permissions {value.length > 0 && `(${value.length})`}
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={13} />}
          onClick={() => onChange([...value, emptyPermission()])}
        >
          Add
        </Button>
      </Group>

      {value.length === 0 && (
        <Text size="xs" c="dimmed">
          A role with no permissions grants nothing. Add at least one.
        </Text>
      )}

      {value.map((p, i) => {
        const spec = RESOURCES.find((r) => r.value === p.resource) ?? RESOURCES[0]
        return (
          <Stack key={i} gap={6} p="xs" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 8 }}>
            <Group gap="xs" wrap="nowrap" align="end">
              <Select
                size="xs"
                label="Resource"
                data={RESOURCES.map((r) => ({ value: r.value, label: r.label }))}
                value={p.resource}
                onChange={(v) => {
                  const next = RESOURCES.find((r) => r.value === v) ?? RESOURCES[0]
                  // Verbs and scope fields differ per resource, so reset both
                  // rather than carrying over ones the new resource rejects.
                  update(i, {
                    resource: next.value,
                    actions: { [next.verbs[0].key]: true },
                    collection: next.scope.includes('collection') ? '*' : undefined,
                    tenant: next.scope.includes('tenant') ? '*' : undefined,
                    alias: next.scope.includes('alias') ? '*' : undefined,
                    role: next.scope.includes('role') ? '*' : undefined,
                    user: next.scope.includes('user') ? '*' : undefined,
                    group: next.scope.includes('group') ? '*' : undefined
                  })
                }}
                w={170}
              />
              {spec.scope.includes('collection') && (
                <TextInput
                  size="xs"
                  label="Collection"
                  placeholder="* for all"
                  value={p.collection ?? '*'}
                  onChange={(e) => update(i, { collection: e.currentTarget.value })}
                  style={{ flex: 1 }}
                />
              )}
              {spec.scope.includes('tenant') && (
                <TextInput
                  size="xs"
                  label="Tenant"
                  placeholder="* for all"
                  value={p.tenant ?? '*'}
                  onChange={(e) => update(i, { tenant: e.currentTarget.value })}
                  w={130}
                />
              )}
              {spec.scope.includes('alias') && (
                <TextInput
                  size="xs"
                  label="Alias"
                  placeholder="* for all"
                  value={p.alias ?? '*'}
                  onChange={(e) => update(i, { alias: e.currentTarget.value })}
                  w={130}
                />
              )}
              {spec.scope.includes('role') && (
                <TextInput
                  size="xs"
                  label="Role"
                  placeholder="* for all"
                  value={p.role ?? '*'}
                  onChange={(e) => update(i, { role: e.currentTarget.value })}
                  w={130}
                />
              )}
              {spec.scope.includes('user') && (
                <TextInput
                  size="xs"
                  label="User"
                  placeholder="* for all"
                  value={p.user ?? '*'}
                  onChange={(e) => update(i, { user: e.currentTarget.value })}
                  w={130}
                />
              )}
              {spec.scope.includes('group') && (
                <TextInput
                  size="xs"
                  label="Group"
                  placeholder="* for all"
                  value={p.group ?? '*'}
                  onChange={(e) => update(i, { group: e.currentTarget.value })}
                  w={130}
                />
              )}
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Group>
            <Group gap="md">
              {spec.verbs.map((verb) => (
                <Checkbox
                  key={verb.key}
                  size="xs"
                  label={verb.label}
                  checked={Boolean(p.actions[verb.key])}
                  onChange={(e) =>
                    update(i, { actions: { ...p.actions, [verb.key]: e.currentTarget.checked } })
                  }
                />
              ))}
            </Group>
          </Stack>
        )
      })}
    </Stack>
  )
}
