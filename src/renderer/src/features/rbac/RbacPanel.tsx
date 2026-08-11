import { useEffect, useState } from 'react'
import {
  Box,
  Tabs,
  Stack,
  Group,
  Text,
  Button,
  Table,
  Badge,
  Modal,
  TextInput,
  MultiSelect,
  Center,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Code,
  CopyButton,
  Accordion,
  Switch
} from '@mantine/core'
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconAlertTriangle,
  IconKey,
  IconUsers,
  IconShieldLock,
  IconUsersGroup,
  IconCopy,
  IconCheck,
  IconDownload
} from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isLockedRole, type PermissionInput } from '@shared/types'
import { api, errMsg } from '../../lib/api'
import { notifyErr, notifyOk } from '../../lib/notify'
import { downloadText } from '../../lib/exportFile'
import { PermissionEditor, emptyPermission } from './PermissionEditor'
import {
  USER_ID_HINT,
  VALID_USER_ID,
  assignableRoles,
  keyFileContents,
  preserveLocked,
  roleDiff,
  roleOptions,
  type IssuedKey
} from './userKey'

interface Props {
  connectionId: string
}

/** A generated key is shown exactly once — Weaviate never returns it again. */
function KeyModal({ issued, onClose }: { issued: IssuedKey; onClose: () => void }) {
  const download = () => {
    downloadText(
      `${issued.userId}-api-key.txt`,
      keyFileContents(issued, new Date().toISOString()),
      'text/plain'
    )
    notifyOk(`Saved ${issued.userId}-api-key.txt`)
  }

  return (
    <Modal opened onClose={onClose} title={`API key for ${issued.userId}`} centered>
      <Stack gap="sm">
        <Alert color="orange" icon={<IconAlertTriangle />}>
          Make sure to copy or download this key now. Weaviate does not store it in retrievable
          form, so it cannot be shown again — you would have to rotate the key to get a new one.
        </Alert>

        {issued.roleError ? (
          <Alert color="red" icon={<IconAlertTriangle />} title="Roles were not assigned">
            The user was created and this key is valid, but assigning the roles failed:{' '}
            {issued.roleError}. Assign them from the users table.
          </Alert>
        ) : (
          issued.roles &&
          issued.roles.length > 0 && (
            <Group gap={4}>
              <Text size="xs" c="dimmed">
                Roles:
              </Text>
              {issued.roles.map((r) => (
                <Badge key={r} size="xs" variant="dot">
                  {r}
                </Badge>
              ))}
            </Group>
          )
        )}

        <Group gap="xs" wrap="nowrap">
          <Code style={{ flex: 1, wordBreak: 'break-all' }}>{issued.apiKey}</Code>
          <CopyButton value={issued.apiKey} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy key'}>
                <ActionIcon variant="light" color={copied ? 'teal' : undefined} onClick={copy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        <Text size="xs" c="dimmed">
          The downloaded file holds the key in plain text — store it somewhere you would keep a
          password.
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Done
          </Button>
          <Button leftSection={<IconDownload size={15} />} onClick={download}>
            Download
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function RolesTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<PermissionInput[]>([emptyPermission()])

  const roles = useQuery({
    queryKey: ['roles', connectionId],
    queryFn: () => api.rbac.listRoles(connectionId)
  })

  // Editing a role can change what the connected user themselves may do.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['roles', connectionId] })
    qc.invalidateQueries({ queryKey: ['capabilities', connectionId] })
  }

  const create = useMutation({
    mutationFn: () => api.rbac.createRole(connectionId, name.trim(), permissions),
    onSuccess: () => {
      notifyOk(`Role ${name} created`)
      setCreating(false)
      setName('')
      setPermissions([emptyPermission()])
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not create role')
  })

  const remove = useMutation({
    mutationFn: (role: string) => api.rbac.deleteRole(connectionId, role),
    onSuccess: () => {
      notifyOk('Role deleted')
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not delete role')
  })

  if (roles.isLoading) {
    return (
      <Center h={160}>
        <Loader />
      </Center>
    )
  }
  if (roles.isError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} title="Could not load roles">
        {(roles.error as Error).message}
        <Text size="xs" mt="xs">
          RBAC needs Weaviate 1.29+ with authorization enabled, and the connected user needs
          permission to read roles.
        </Text>
      </Alert>
    )
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {roles.data?.length ?? 0} roles
        </Text>
        <Group gap="xs">
          <ActionIcon variant="light" onClick={invalidate}>
            <IconRefresh size={16} />
          </ActionIcon>
          <Button size="xs" leftSection={<IconPlus size={15} />} onClick={() => setCreating(true)}>
            New role
          </Button>
        </Group>
      </Group>

      <Accordion variant="separated">
        {roles.data?.map((role) => (
          <Accordion.Item key={role.name} value={role.name}>
            <Accordion.Control>
              <Group justify="space-between" pr="md">
                <Group gap="xs">
                  <Text fw={600}>{role.name}</Text>
                  <Badge size="xs" variant="light">
                    {role.permissions.length} permissions
                  </Badge>
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Resource</Table.Th>
                      <Table.Th>Scope</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {role.permissions.map((p, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>
                          <Badge variant="light" size="sm">
                            {p.resource}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {[p.collection, p.tenant, p.alias, p.role, p.user, p.group]
                              .filter(Boolean)
                              .join(' / ') || '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {p.actions.map((a) => (
                              <Badge key={a} size="xs" variant="dot">
                                {a}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Group justify="flex-end">
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={13} />}
                    onClick={() => remove.mutate(role.name)}
                  >
                    Delete role
                  </Button>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New role" size="lg" centered>
        <Stack gap="md">
          <TextInput
            label="Role name"
            placeholder="analyst"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <PermissionEditor value={permissions} onChange={setPermissions} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || permissions.length === 0}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Create role
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

function UsersTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newUserRoles, setNewUserRoles] = useState<string[]>([])
  const [issuedKey, setIssuedKey] = useState<IssuedKey | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignRoles, setAssignRoles] = useState<string[]>([])
  /** The roles the user held when the editor opened, to diff Save against. */
  const [originalRoles, setOriginalRoles] = useState<string[]>([])

  const users = useQuery({
    queryKey: ['users', connectionId],
    queryFn: () => api.rbac.listUsers(connectionId)
  })
  const roles = useQuery({
    queryKey: ['roles', connectionId],
    queryFn: () => api.rbac.listRoles(connectionId)
  })
  const me = useQuery({
    queryKey: ['myUser', connectionId],
    queryFn: () => api.rbac.getMyUser(connectionId)
  })

  // Granting or revoking roles can change the connected user's own access.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users', connectionId] })
    qc.invalidateQueries({ queryKey: ['capabilities', connectionId] })
  }

  /**
   * Weaviate has no single call that creates a user with roles, so this is a
   * create followed by an assign. If the assign fails the user still exists and
   * the key is still valid — and the key is unrecoverable — so we surface it
   * either way rather than treating the whole thing as failed.
   */
  const create = useMutation<IssuedKey, Error>({
    mutationFn: async () => {
      const userId = newUserId.trim()
      const { apiKey } = await api.rbac.createUser(connectionId, userId)
      if (newUserRoles.length === 0) return { userId, apiKey, roles: [] }
      try {
        await api.rbac.assignRoles(connectionId, userId, newUserRoles)
        return { userId, apiKey, roles: newUserRoles }
      } catch (e) {
        return { userId, apiKey, roleError: errMsg(e) }
      }
    },
    onSuccess: (issued) => {
      setIssuedKey(issued)
      setCreating(false)
      setNewUserId('')
      setNewUserRoles([])
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not create user')
  })

  const rotate = useMutation({
    mutationFn: (userId: string) => api.rbac.rotateKey(connectionId, userId),
    onSuccess: (r, userId) => setIssuedKey({ userId, apiKey: r.apiKey }),
    onError: (e) => notifyErr(e, 'Could not rotate key')
  })

  const setActive = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) =>
      api.rbac.setUserActive(connectionId, v.userId, v.active),
    onSuccess: () => invalidate(),
    onError: (e) => notifyErr(e, 'Could not change user status')
  })

  const remove = useMutation({
    mutationFn: (userId: string) => api.rbac.deleteUser(connectionId, userId),
    onSuccess: () => {
      notifyOk('User deleted')
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not delete user')
  })

  /**
   * Saves the role set as edited. Weaviate has separate assign and revoke
   * calls, so a Save is the diff applied as up to two requests. Revokes go
   * first: if the user is trading one role for another, dropping the old one
   * before adding the new never leaves them holding both.
   */
  const assign = useMutation<{ added: string[]; removed: string[] }, Error>({
    mutationFn: async () => {
      const userId = assigning!
      const { added, removed } = roleDiff(originalRoles, assignRoles)
      if (removed.length) await api.rbac.revokeRoles(connectionId, userId, removed)
      if (added.length) await api.rbac.assignRoles(connectionId, userId, added)
      return { added, removed }
    },
    onSuccess: ({ added, removed }) => {
      const parts: string[] = []
      if (added.length) parts.push(`granted ${added.join(', ')}`)
      if (removed.length) parts.push(`revoked ${removed.join(', ')}`)
      notifyOk(parts.length ? parts.join(' · ') : 'No role changes to apply')
      setAssigning(null)
      setAssignRoles([])
      setOriginalRoles([])
      invalidate()
    },
    onError: (e) => notifyErr(e, 'Could not update roles')
  })

  if (users.isLoading) {
    return (
      <Center h={160}>
        <Loader />
      </Center>
    )
  }
  if (users.isError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} title="Could not load users">
        {(users.error as Error).message}
        <Text size="xs" mt="xs">
          Database users need Weaviate 1.30+ with API-key auth and RBAC enabled.
        </Text>
      </Alert>
    )
  }

  const roleNames = (roles.data ?? []).map((r) => r.name)
  const pickableRoles = roleOptions(roleNames)
  const pendingChanges = roleDiff(originalRoles, assignRoles)
  const hasRoleChanges =
    pendingChanges.added.length > 0 || pendingChanges.removed.length > 0
  // Only assignable roles count towards "are there roles to choose from" —
  // an instance with nothing but protected built-ins offers no real choice.
  const hasAssignableRoles = assignableRoles(roleNames).length > 0

  const trimmedId = newUserId.trim()
  const nameError = trimmedId && !VALID_USER_ID.test(trimmedId) ? USER_ID_HINT : undefined
  // A role is required whenever there is one to pick, so a user can't be
  // created with no access by accident — but an instance with no roles yet
  // shouldn't be a dead end.
  const canCreate =
    Boolean(trimmedId) && !nameError && (!hasAssignableRoles || newUserRoles.length > 0)

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {me.data ? (
            <>
              Connected as <Code>{me.data.id}</Code>
              {me.data.roles.length > 0 && ` · ${me.data.roles.join(', ')}`}
            </>
          ) : (
            `${users.data?.length ?? 0} users`
          )}
        </Text>
        <Group gap="xs">
          <ActionIcon variant="light" onClick={invalidate}>
            <IconRefresh size={16} />
          </ActionIcon>
          <Button size="xs" leftSection={<IconPlus size={15} />} onClick={() => setCreating(true)}>
            New user
          </Button>
        </Group>
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>User</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Roles</Table.Th>
            <Table.Th>Last used</Table.Th>
            <Table.Th w={190} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.data?.map((u) => {
            // Users defined by server env vars can't be edited over the API.
            const managed = u.kind === 'db_user'
            return (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <Code>{u.id}</Code>
                </Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light" color={managed ? 'aqua' : 'gray'}>
                    {u.kind ?? 'unknown'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {u.roles.length === 0 && (
                      <Text size="xs" c="dimmed">
                        none
                      </Text>
                    )}
                    {u.roles.map((r) => (
                      <Badge key={r} size="xs" variant="dot">
                        {r}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {u.lastUsedAt ? new Date(u.lastUsedAt).toLocaleString() : '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label="Edit roles">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => {
                          setAssigning(u.id)
                          setAssignRoles(u.roles)
                          setOriginalRoles(u.roles)
                        }}
                      >
                        <IconShieldLock size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={managed ? 'Rotate API key' : 'Env users cannot be rotated'}>
                      <ActionIcon
                        variant="subtle"
                        disabled={!managed}
                        onClick={() => rotate.mutate(u.id)}
                      >
                        <IconKey size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Switch
                      size="xs"
                      checked={u.active !== false}
                      disabled={!managed}
                      onChange={(e) =>
                        setActive.mutate({ userId: u.id, active: e.currentTarget.checked })
                      }
                    />
                    <Tooltip label={managed ? 'Delete' : 'Env users cannot be deleted'}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        disabled={!managed}
                        onClick={() => remove.mutate(u.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New database user" centered>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Set the scope for the new user. Weaviate issues an API key on creation and shows it
            only once — a user with no roles can authenticate but do nothing.
          </Text>
          <TextInput
            label="User ID"
            withAsterisk
            description="Letters, numbers, underscores, hyphens and dots only."
            placeholder='e.g. "analytics-service"'
            value={newUserId}
            error={nameError}
            onChange={(e) => setNewUserId(e.currentTarget.value)}
          />
          <MultiSelect
            label="Role(s)"
            withAsterisk={hasAssignableRoles}
            placeholder={hasAssignableRoles ? 'Select role(s)' : 'No assignable roles defined yet'}
            description={
              hasAssignableRoles
                ? 'Assigned immediately after the user is created.'
                : 'Create a role first to grant this user any access.'
            }
            data={pickableRoles}
            value={newUserRoles}
            onChange={setNewUserRoles}
            disabled={!hasAssignableRoles}
            searchable
            clearable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canCreate}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Create user
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assigning !== null}
        onClose={() => setAssigning(null)}
        title={`Edit roles for ${assigning ?? ''}`}
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Remove a role with its × and add one from the list. Save applies both.
          </Text>
          <MultiSelect
            label="Role(s)"
            data={pickableRoles}
            value={assignRoles}
            // Protected built-ins can't be revoked, so a removed chip would be
            // a promise we can't keep — put it straight back.
            onChange={(next) => setAssignRoles(preserveLocked(originalRoles, next))}
            searchable
            clearable
          />
          {originalRoles.some(isLockedRole) && (
            <Text size="xs" c="dimmed">
              This user holds a protected built-in role, which Weaviate will not let you revoke.
            </Text>
          )}
          {pendingChanges.removed.length > 0 && (
            <Alert color="orange" p="xs" icon={<IconAlertTriangle />}>
              <Text size="xs">
                Revoking {pendingChanges.removed.join(', ')} takes effect immediately for anything
                using this user&apos;s key.
              </Text>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              disabled={!hasRoleChanges}
              loading={assign.isPending}
              onClick={() => assign.mutate()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      {issuedKey && <KeyModal issued={issuedKey} onClose={() => setIssuedKey(null)} />}
    </Stack>
  )
}

function GroupsTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [groupRoles, setGroupRoles] = useState<string[]>([])
  const [originalGroupRoles, setOriginalGroupRoles] = useState<string[]>([])

  const groups = useQuery({
    queryKey: ['groups', connectionId],
    queryFn: () => api.rbac.listGroups(connectionId)
  })
  const roles = useQuery({
    queryKey: ['roles', connectionId],
    queryFn: () => api.rbac.listRoles(connectionId)
  })

  const assigned = useQuery({
    queryKey: ['groupRoles', connectionId, selected],
    queryFn: () => api.rbac.groupRoles(connectionId, selected!),
    enabled: selected !== null
  })

  // The group's current roles arrive after the modal opens, so seed the editor
  // from them rather than starting empty and reading as "revoke everything".
  useEffect(() => {
    if (selected === null || !assigned.data) return
    setGroupRoles(assigned.data)
    setOriginalGroupRoles(assigned.data)
  }, [selected, assigned.data])

  const assign = useMutation<{ added: string[]; removed: string[] }, Error>({
    mutationFn: async () => {
      const groupId = selected!
      const { added, removed } = roleDiff(originalGroupRoles, groupRoles)
      if (removed.length) await api.rbac.revokeGroupRoles(connectionId, groupId, removed)
      if (added.length) await api.rbac.assignGroupRoles(connectionId, groupId, added)
      return { added, removed }
    },
    onSuccess: ({ added, removed }) => {
      const parts: string[] = []
      if (added.length) parts.push(`granted ${added.join(', ')}`)
      if (removed.length) parts.push(`revoked ${removed.join(', ')}`)
      notifyOk(parts.length ? parts.join(' · ') : 'No role changes to apply')
      qc.invalidateQueries({ queryKey: ['groupRoles', connectionId] })
      setSelected(null)
    },
    onError: (e) => notifyErr(e, 'Could not update group roles')
  })

  const groupChanges = roleDiff(originalGroupRoles, groupRoles)
  const groupHasChanges = groupChanges.added.length > 0 || groupChanges.removed.length > 0

  if (groups.isLoading) {
    return (
      <Center h={160}>
        <Loader />
      </Center>
    )
  }

  if ((groups.data?.length ?? 0) === 0) {
    return (
      <Text c="dimmed">
        No OIDC groups known to this instance. Groups appear here once OIDC dynamic authorization is
        configured on the server.
      </Text>
    )
  }

  return (
    <Stack gap="sm">
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Group</Table.Th>
            <Table.Th w={140} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.data?.map((g) => (
            <Table.Tr key={g}>
              <Table.Td>
                <Code>{g}</Code>
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => {
                      setSelected(g)
                      setGroupRoles([])
                      setOriginalGroupRoles([])
                    }}
                  >
                    Manage roles
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={`Roles for ${selected ?? ''}`}
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Remove a role with its × and add one from the list. Save applies both.
          </Text>
          {assigned.isLoading ? (
            <Center h={80}>
              <Loader size="sm" />
            </Center>
          ) : (
            <MultiSelect
              label="Role(s)"
              data={roleOptions((roles.data ?? []).map((r) => r.name))}
              value={groupRoles}
              onChange={(next) => setGroupRoles(preserveLocked(originalGroupRoles, next))}
              searchable
              clearable
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              disabled={!groupHasChanges}
              loading={assign.isPending}
              onClick={() => assign.mutate()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

export function RbacPanel({ connectionId }: Props) {
  return (
    <Box p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Text fw={700} size="lg" mb={4}>
        Access control
      </Text>
      <Text size="sm" c="dimmed" mb="md">
        Roles bundle permissions; users and OIDC groups are granted roles. Requires RBAC to be
        enabled on the server.
      </Text>

      <Tabs defaultValue="roles">
        <Tabs.List mb="md">
          <Tabs.Tab value="roles" leftSection={<IconShieldLock size={15} />}>
            Roles
          </Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<IconUsers size={15} />}>
            Users
          </Tabs.Tab>
          <Tabs.Tab value="groups" leftSection={<IconUsersGroup size={15} />}>
            Groups
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="roles">
          <RolesTab connectionId={connectionId} />
        </Tabs.Panel>
        <Tabs.Panel value="users">
          <UsersTab connectionId={connectionId} />
        </Tabs.Panel>
        <Tabs.Panel value="groups">
          <GroupsTab connectionId={connectionId} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
