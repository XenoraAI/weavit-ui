import { useState } from 'react'
import { Stack, Group, Select, TextInput, Button, Badge, Text, Alert } from '@mantine/core'
import { IconAlertTriangle, IconWand } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { TokenizeResult } from '@shared/types'
import { api } from '../../lib/api'

const TOKENIZATIONS = ['word', 'lowercase', 'whitespace', 'field', 'trigram', 'gse', 'kagome_kr']

/**
 * Shows how Weaviate would split text into tokens. Worth reaching for when a
 * BM25 query isn't matching what you expect — usually the tokenization on the
 * property is not what you assumed.
 */
export function TokenizerPreview({ connectionId }: { connectionId: string }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'strategy' | 'property'>('strategy')
  const [tokenization, setTokenization] = useState<string | null>('word')
  const [collection, setCollection] = useState<string | null>(null)
  const [property, setProperty] = useState<string | null>(null)

  const collections = useQuery({
    queryKey: ['collections', connectionId],
    queryFn: () => api.schema.listCollections(connectionId)
  })
  const config = useQuery({
    queryKey: ['collection', connectionId, collection],
    queryFn: () => api.schema.getCollection(connectionId, collection!),
    enabled: collection !== null
  })

  const run = useMutation<TokenizeResult, Error>({
    mutationFn: () =>
      api.admin.tokenize({
        connectionId,
        text,
        tokenization: mode === 'strategy' ? tokenization ?? 'word' : undefined,
        collection: mode === 'property' ? collection ?? undefined : undefined,
        property: mode === 'property' ? property ?? undefined : undefined
      })
  })

  const canRun =
    text.trim().length > 0 && (mode === 'strategy' ? Boolean(tokenization) : Boolean(collection && property))

  return (
    <Stack gap="sm">
      <Group grow align="end">
        <Select
          size="xs"
          label="Tokenize by"
          data={[
            { value: 'strategy', label: 'Strategy' },
            { value: 'property', label: "A property's config" }
          ]}
          value={mode}
          onChange={(v) => setMode((v as 'strategy' | 'property') ?? 'strategy')}
        />
        {mode === 'strategy' ? (
          <Select
            size="xs"
            label="Tokenization"
            data={TOKENIZATIONS}
            value={tokenization}
            onChange={setTokenization}
          />
        ) : (
          <>
            <Select
              size="xs"
              label="Collection"
              searchable
              data={(collections.data ?? []).map((c) => c.name)}
              value={collection}
              onChange={(v) => {
                setCollection(v)
                setProperty(null)
              }}
            />
            <Select
              size="xs"
              label="Property"
              searchable
              disabled={!collection}
              data={(config.data?.properties ?? []).map((p) => p.name)}
              value={property}
              onChange={setProperty}
            />
          </>
        )}
      </Group>

      <TextInput
        label="Text"
        placeholder="The quick brown fox"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />

      <Group justify="flex-end">
        <Button
          size="xs"
          leftSection={<IconWand size={14} />}
          disabled={!canRun}
          loading={run.isPending}
          onClick={() => run.mutate()}
        >
          Tokenize
        </Button>
      </Group>

      {run.isError && (
        <Alert color="red" icon={<IconAlertTriangle />}>
          {run.error.message}
          <Text size="xs" mt="xs">
            The tokenize endpoint needs Weaviate 1.37 or newer.
          </Text>
        </Alert>
      )}

      {run.data && (
        <Stack gap="xs">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>
              Indexed
            </Text>
            <Group gap={6}>
              {run.data.tokens.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No tokens produced.
                </Text>
              ) : (
                run.data.tokens.map((t, i) => (
                  <Badge key={`i-${t}-${i}`} variant="light" className="weft-mono">
                    {t}
                  </Badge>
                ))
              )}
            </Group>
          </div>
          {run.data.queryTokens && (
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>
                As a query
              </Text>
              <Group gap={6}>
                {run.data.queryTokens.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Every term was dropped as a stopword — this query would match nothing.
                  </Text>
                ) : (
                  run.data.queryTokens.map((t, i) => (
                    <Badge key={`q-${t}-${i}`} variant="light" color="grape" className="weft-mono">
                      {t}
                    </Badge>
                  ))
                )}
              </Group>
            </div>
          )}
        </Stack>
      )}
    </Stack>
  )
}
