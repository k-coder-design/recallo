import { z } from 'zod'

export const spaceIdSchema = z.enum(['en', 'es'], { error: 'Unknown language space' })

const exampleSchema = z.object({
  text: z.string().trim().min(1, 'Example text cannot be empty'),
  translation: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
  maskFragments: z.array(z.string().trim().min(1)).default([])
})

const termSchema = z.string().trim().min(1, 'Enter a word or phrase')
const meaningSchema = z.string().trim().min(1, 'Enter a meaning')
const transcriptionSchema = z.string().max(300, 'Transcription is too long').nullish()
const emojiSchema = z.string().trim().max(32, 'Choose a single emoji').nullish()
/** Набор карточки: id набора или null — «без набора». */
const setIdSchema = z.string().min(1).nullish()

export const cardCreateSchema = z.object({
  spaceId: spaceIdSchema,
  setId: setIdSchema,
  term: termSchema,
  transcription: transcriptionSchema,
  transcriptionAlt: transcriptionSchema,
  emoji: emojiSchema,
  meaning: meaningSchema,
  examples: z.array(exampleSchema).default([])
})

export const cardUpdateSchema = z.object({
  version: z.number().int().positive(),
  setId: setIdSchema,
  term: termSchema.optional(),
  transcription: transcriptionSchema,
  transcriptionAlt: transcriptionSchema,
  emoji: emojiSchema,
  meaning: meaningSchema.optional(),
  examples: z.array(exampleSchema).optional(),
  resetProgress: z.boolean().default(false)
})

const setNameSchema = z.string().trim().min(1, 'Enter a set name').max(80, 'The set name is too long')
const setDescriptionSchema = z
  .string()
  .trim()
  .max(300, 'The description is too long')
  .nullish()
  .transform((value) => value || null)

export const setCreateSchema = z.object({
  spaceId: spaceIdSchema,
  name: setNameSchema,
  description: setDescriptionSchema
})

export const setUpdateSchema = z.object({
  version: z.number().int().positive(),
  name: setNameSchema.optional(),
  description: setDescriptionSchema.optional()
})

/** Политика удаления набора обязательна: без неё карточки не удаляются неявно (SET-11). */
export const setDeletePolicySchema = z.enum(['keep-cards', 'delete-cards'], {
  error: 'Choose what to do with the cards: keep-cards or delete-cards'
})

export const scopeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('set'), setId: z.string().min(1) }),
    z.object({ kind: z.literal('none') })
  ])
  .default({ kind: 'all' })

export const cardQuerySchema = z
  .object({
    scope: scopeSchema,
    search: z.string().trim().max(200).optional()
  })
  .default({ scope: { kind: 'all' } })

export const gradeSchema = z.enum(['remembered', 'forgot'], { error: 'Unknown grade' })

export const nextOptionsSchema = z
  .object({
    scope: scopeSchema,
    avoidCardId: z.string().optional(),
    allowEarly: z.boolean().optional(),
    afterNew: z.boolean().optional()
  })
  .default({ scope: { kind: 'all' } })
