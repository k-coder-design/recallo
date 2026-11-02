/** REST API description in OpenAPI 3.1 format with examples (API-09). Example meanings follow the user's style: Russian, then an English definition. */
export function buildOpenApi(version: string) {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
  const json = (schema: unknown, example?: unknown) => ({
    'application/json': { schema, ...(example !== undefined ? { example } : {}) }
  })
  const error = (description: string, code: string, message: string) => ({
    description,
    content: json(ref('Error'), { error: { code, message } })
  })
  const idempotencyKey = {
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    description: 'Any unique string (e.g. a UUID). Repeating the request with the same key and body returns the saved response instead of running it again (24 h).',
    schema: { type: 'string', maxLength: 200 }
  }
  const ifMatch = {
    name: 'If-Match',
    in: 'header',
    required: false,
    description: 'Current version, e.g. "3". Alternative to "version" in the body. A stale version returns 409.',
    schema: { type: 'string' }
  }
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
  const languageQuery = { name: 'language', in: 'query', required: true, schema: ref('Language') }

  const exampleCard = {
    id: '6f1c2e2a-3b4d-4c5e-8f90-1a2b3c4d5e6f',
    language: 'en',
    setId: '0b7e5a10-2c3d-4e5f-9a8b-7c6d5e4f3a2b',
    term: 'gripping',
    transcription: 'ˈɡrɪpɪŋ',
    meaning: 'захватывающий, увлекательный (so interesting that you can’t stop watching)',
    emoji: '🍿',
    examples: [
      {
        text: 'It’s a gripping thriller — I watched it in one go.',
        translation: 'Это захватывающий триллер — я посмотрела его на одном дыхании.',
        maskFragments: [],
        maskedRanges: [[7, 15]]
      }
    ],
    version: 1,
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z'
  }
  const exampleSet = {
    id: '0b7e5a10-2c3d-4e5f-9a8b-7c6d5e4f3a2b',
    language: 'en',
    name: 'Movie',
    description: 'Words to describe films',
    cardCount: 17,
    version: 1,
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z'
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Recallo Agent API',
      version,
      description:
        'Local API of the Recallo flashcard app for AI agents: read and edit sets and cards. ' +
        'Runs only while Recallo is open and "Agent API" is enabled in Settings; listens on 127.0.0.1 only. ' +
        'Learning progress and review history are not exposed. Transcription, emoji and word masking are filled in by the app.'
    },
    servers: [{ url: 'http://127.0.0.1:{port}', variables: { port: { default: '47821' } } }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token from Recallo → Settings → Agent API' } },
      schemas: {
        Language: { type: 'string', enum: ['en', 'es'] },
        Example: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', description: 'Sentence that uses the word' },
            translation: { type: ['string', 'null'] },
            maskFragments: { type: 'array', items: { type: 'string' }, description: 'Irregular forms to hide, e.g. "went" for "go"' },
            maskedRanges: {
              type: 'array',
              readOnly: true,
              items: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
              description: 'Character ranges [start, end) hidden on the card front'
            }
          }
        },
        Card: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            language: ref('Language'),
            setId: { type: ['string', 'null'], description: 'null — “No set”' },
            term: { type: 'string' },
            transcription: { type: ['string', 'null'], description: 'IPA without slashes; Spanish — Argentine (es-AR)' },
            transcriptionAlt: { type: ['string', 'null'], description: 'Second pronunciation: Spanish — Spain (es-ES); always null for English' },
            meaning: { type: 'string' },
            emoji: { type: ['string', 'null'] },
            examples: { type: 'array', items: ref('Example') },
            version: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        CardFields: {
          type: 'object',
          properties: {
            setId: { type: ['string', 'null'] },
            term: { type: 'string', minLength: 1 },
            meaning: { type: 'string', minLength: 1, description: 'Translation or definition; may be in any language' },
            transcription: { type: ['string', 'null'], description: 'Omit to fill in automatically' },
            transcriptionAlt: { type: ['string', 'null'], description: 'Spanish only: Spain pronunciation. Omit to fill in automatically' },
            emoji: { type: ['string', 'null'], description: 'Omit to pick automatically; null — no emoji' },
            examples: { type: 'array', items: ref('Example') }
          }
        },
        Set: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            language: ref('Language'),
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            cardCount: { type: 'integer' },
            version: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  description:
                    'VALIDATION, NOT_FOUND, CONFLICT, DUPLICATE, UNAUTHORIZED, FORBIDDEN_HOST, VERSION_REQUIRED, IDEMPOTENCY_MISMATCH, INVALID_JSON, PAYLOAD_TOO_LARGE, INTERNAL'
                },
                message: { type: 'string' },
                details: {}
              }
            }
          }
        }
      }
    },
    paths: {
      '/api/v1/health': {
        get: {
          summary: 'Check that Recallo is running',
          security: [],
          responses: { '200': { description: 'OK', content: json({ type: 'object' }, { ok: true, app: 'Recallo', version }) } }
        }
      },
      '/api/v1/openapi.json': { get: { summary: 'This document', security: [], responses: { '200': { description: 'OpenAPI document' } } } },
      '/api/v1/languages': {
        get: {
          summary: 'Language spaces',
          responses: {
            '200': { description: 'Languages', content: json({ type: 'array' }, [{ id: 'en', name: 'English' }, { id: 'es', name: 'Spanish' }]) },
            '401': error('Missing or invalid token', 'UNAUTHORIZED', 'Missing or invalid token.')
          }
        }
      },
      '/api/v1/sets': {
        get: {
          summary: 'Sets of a language',
          parameters: [languageQuery],
          responses: { '200': { description: 'Sets', content: json({ type: 'array', items: ref('Set') }, [exampleSet]) } }
        },
        post: {
          summary: 'Create a set',
          parameters: [idempotencyKey],
          requestBody: {
            required: true,
            content: json(
              { type: 'object', required: ['language', 'name'], properties: { language: ref('Language'), name: { type: 'string' }, description: { type: ['string', 'null'] } } },
              { language: 'en', name: 'Travel', description: 'Airports, hotels and trips' }
            )
          },
          responses: {
            '201': { description: 'Created', content: json(ref('Set'), { ...exampleSet, name: 'Travel', cardCount: 0 }) },
            '400': error('Invalid data or the name is taken', 'VALIDATION', 'A set named “Travel” already exists')
          }
        }
      },
      '/api/v1/sets/{id}': {
        get: { summary: 'A set', parameters: [idParam], responses: { '200': { description: 'Set', content: json(ref('Set'), exampleSet) }, '404': error('Not found', 'NOT_FOUND', 'Set not found') } },
        patch: {
          summary: 'Rename a set or change its description',
          parameters: [idParam, ifMatch, idempotencyKey],
          requestBody: { required: true, content: json({ type: 'object' }, { version: 1, name: 'Movies' }) },
          responses: {
            '200': { description: 'Updated', content: json(ref('Set'), { ...exampleSet, name: 'Movies', version: 2 }) },
            '409': error('The set was changed since you read it', 'CONFLICT', 'This set has been changed elsewhere. Reopen it and try again.'),
            '428': error('No version given', 'VERSION_REQUIRED', 'Send the current version')
          }
        },
        delete: {
          summary: 'Delete a set',
          description: 'policy is required: keep-cards moves the cards to “No set” with their progress; delete-cards deletes them permanently.',
          parameters: [idParam, { name: 'policy', in: 'query', required: true, schema: { type: 'string', enum: ['keep-cards', 'delete-cards'] } }, idempotencyKey],
          responses: {
            '200': { description: 'Deleted', content: json({ type: 'object' }, { affectedCards: 17 }) },
            '400': error('No policy given', 'VALIDATION', 'Choose what to do with the cards: keep-cards or delete-cards')
          }
        }
      },
      '/api/v1/cards': {
        get: {
          summary: 'List or search cards',
          parameters: [
            languageQuery,
            { name: 'set', in: 'query', schema: { type: 'string' }, description: 'Set id, or "none" for cards without a set' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Every word of the query must match the card word, meaning, examples, translations or set name (case- and accent-insensitive, partial words, one typo forgiven in words of 5+ letters). Best matches first' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 1000 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: { '200': { description: 'Cards', content: json({ type: 'object' }, { total: 1, limit: 200, offset: 0, cards: [exampleCard] }) } }
        },
        post: {
          summary: 'Create a card',
          description: 'Returns 409 DUPLICATE if the word already exists in this language, unless "allowDuplicates": true.',
          parameters: [idempotencyKey],
          requestBody: {
            required: true,
            content: json(
              { allOf: [ref('CardFields'), { type: 'object', required: ['language', 'term', 'meaning'], properties: { language: ref('Language'), allowDuplicates: { type: 'boolean' } } }] },
              { language: 'en', setId: exampleSet.id, term: 'gripping', meaning: 'захватывающий', examples: [{ text: 'It’s a gripping thriller.', translation: 'Это захватывающий триллер.' }] }
            )
          },
          responses: {
            '201': { description: 'Created', content: json(ref('Card'), exampleCard) },
            '409': error('The word already exists', 'DUPLICATE', '“gripping” already exists. Send "allowDuplicates": true to add it anyway.')
          }
        }
      },
      '/api/v1/cards/batch': {
        post: {
          summary: 'Create up to 200 cards',
          description: 'Each card gets its own result: created, duplicate (skipped) or error. Partial failures do not cancel the rest.',
          parameters: [idempotencyKey],
          requestBody: {
            required: true,
            content: json(
              { type: 'object', required: ['language', 'cards'], properties: { language: ref('Language'), setId: { type: ['string', 'null'] }, allowDuplicates: { type: 'boolean' }, cards: { type: 'array', items: ref('CardFields') } } },
              { language: 'en', setId: exampleSet.id, cards: [{ term: 'gripping', meaning: 'захватывающий' }, { term: 'dull', meaning: 'скучный' }] }
            )
          },
          responses: {
            '200': {
              description: 'Per-card results',
              content: json({ type: 'object' }, {
                summary: { created: 1, duplicates: 1, errors: 0 },
                results: [
                  { index: 0, status: 'created', card: exampleCard },
                  { index: 1, status: 'duplicate', term: 'dull', existing: [{ id: '…', term: 'dull', meaning: 'скучный', setName: 'Movie' }] }
                ]
              })
            }
          }
        },
        patch: {
          summary: 'Update up to 200 cards',
          parameters: [idempotencyKey],
          requestBody: { required: true, content: json({ type: 'object' }, { updates: [{ id: exampleCard.id, version: 1, emoji: '🎬' }] }) },
          responses: { '200': { description: 'Per-card results', content: json({ type: 'object' }, { summary: { updated: 1, errors: 0 }, results: [{ index: 0, id: exampleCard.id, status: 'updated', card: { ...exampleCard, emoji: '🎬', version: 2 } }] }) } }
        }
      },
      '/api/v1/cards/move': {
        post: {
          summary: 'Move cards to a set or to “No set”',
          description: 'Progress and schedule are kept.',
          parameters: [idempotencyKey],
          requestBody: { required: true, content: json({ type: 'object' }, { cardIds: [exampleCard.id], setId: null }) },
          responses: { '200': { description: 'Moved cards', content: json({ type: 'object' }, { cards: [{ ...exampleCard, setId: null, version: 2 }] }) } }
        }
      },
      '/api/v1/cards/{id}': {
        get: { summary: 'A card', parameters: [idParam], responses: { '200': { description: 'Card', content: json(ref('Card'), exampleCard) }, '404': error('Not found', 'NOT_FOUND', 'Card not found') } },
        patch: {
          summary: 'Edit a card',
          description: 'Progress is kept unless "resetProgress": true. "transcription": null rebuilds it automatically.',
          parameters: [idParam, ifMatch, idempotencyKey],
          requestBody: { required: true, content: json({ type: 'object' }, { version: 1, meaning: 'захватывающий (so exciting you can’t look away)' }) },
          responses: {
            '200': { description: 'Updated', content: json(ref('Card'), { ...exampleCard, version: 2 }) },
            '409': error('Changed since you read it', 'CONFLICT', 'This card has been changed elsewhere. Reopen it and try again.')
          }
        },
        delete: { summary: 'Delete a card with its progress', parameters: [idParam, idempotencyKey], responses: { '204': { description: 'Deleted' } } }
      }
    }
  }
}
