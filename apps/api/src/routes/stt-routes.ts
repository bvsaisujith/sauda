import { Router } from 'express';
import { sttRequestSchema, sttResponseSchema } from '@sauda/shared';
import { HttpError } from '../middleware/http-error.js';
import { providers } from '../providers/index.js';

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

export function createSttRouter(): Router {
  const router = Router();

  router.post('/transcribe', async (request, response) => {
    const body = sttRequestSchema.parse(request.body);
    const audio = Buffer.from(body.base64, 'base64');

    if (audio.length === 0) {
      throw new HttpError(400, 'validation-failed', 'Audio is empty');
    }

    if (audio.length > MAX_AUDIO_BYTES) {
      throw new HttpError(413, 'audio-too-large', 'Audio must be 6 MB or smaller');
    }

    const result = await providers.stt().transcribe({
      audio,
      filename: body.filename,
      mimeType: body.mimeType,
      mode: body.mode,
      ...(body.keyterms === undefined ? {} : { keyterms: body.keyterms }),
    });

    response.json(
      sttResponseSchema.parse({
        text: result.text,
        language: result.language ?? null,
        confidence: result.confidence ?? null,
        requestId: result.requestId ?? null,
        durationSeconds: result.durationSeconds ?? null,
      }),
    );
  });

  return router;
}
