import { z } from 'zod';

export const sttRequestSchema = z.object({
  mimeType: z.enum([
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/flac',
    'audio/aiff',
  ]),
  filename: z.string().trim().min(1).max(120),
  base64: z.string().trim().min(1).max(8_400_000),
  keyterms: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  // Sauda always wants English output, so translated speech is the default.
  mode: z.enum(['transcribe', 'translate', 'verbatim', 'translit', 'codemix']).default('translate'),
});

export type SttRequest = z.infer<typeof sttRequestSchema>;

export const sttResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  requestId: z.string().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
});

export type SttResponse = z.infer<typeof sttResponseSchema>;
