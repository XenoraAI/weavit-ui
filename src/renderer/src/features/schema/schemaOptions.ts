// Option lists shared by the create and edit collection dialogs.

export const DATA_TYPES = [
  'text',
  'text[]',
  'int',
  'int[]',
  'number',
  'number[]',
  'boolean',
  'boolean[]',
  'date',
  'date[]',
  'uuid',
  'uuid[]',
  'blob',
  'geoCoordinates',
  'phoneNumber',
  'object',
  'object[]'
]

/** Only meaningful for text/text[] properties. */
export const TOKENIZATIONS = ['word', 'lowercase', 'whitespace', 'field', 'trigram']

export const VECTORIZERS = [
  'none',
  'text2vec-openai',
  'text2vec-cohere',
  'text2vec-huggingface',
  'text2vec-ollama',
  'text2vec-contextionary'
]

/** HNSW filtered-search strategy; acorn requires Weaviate 1.27+. */
export const FILTER_STRATEGIES = ['sweeping', 'acorn']

export const isTextType = (dataType: string): boolean =>
  dataType === 'text' || dataType === 'text[]'
