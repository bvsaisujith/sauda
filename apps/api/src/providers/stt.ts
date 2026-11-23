import { transcriptionSchema, type Transcription } from '@sauda/shared';
import { ProviderHttpError } from './llm.js';
import type { SttProvider, TranscribeRequest, TranscribeMode } from './types.js';

export interface SarvamCompatibleSttOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: TranscribeMode;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function transcriptionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized}/speech-to-text`;
}

export function createSarvamCompatibleStt(options: SarvamCompatibleSttOptions): SttProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: 'sarvam',

    async transcribe(request: TranscribeRequest): Promise<Transcription> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);

      try {
        const form = new FormData();
        const bytes = new Uint8Array(request.audio);
        form.set('file', new Blob([bytes], { type: request.mimeType }), request.filename);
        form.set('model', options.model);
        form.set('mode', request.mode ?? options.mode ?? 'translate');
        form.set('language_code', request.language ?? 'unknown');
        form.set('with_timestamps', 'false');
        if (request.keyterms && request.keyterms.length > 0) {
          form.set('keyterms', JSON.stringify(request.keyterms.slice(0, 50)));
        }

        const response = await fetchImpl(transcriptionsUrl(options.baseUrl), {
          method: 'POST',
          signal: controller.signal,
          headers: { 'api-subscription-key': options.apiKey },
          body: form,
        });

        if (!response.ok) {
          throw new ProviderHttpError(
            'stt',
            response.status,
            `STT provider returned HTTP ${response.status}`,
          );
        }

        const payload = (await response.json()) as {
          transcript?: string;
          text?: string;
          language_code?: string | null;
          language?: string | null;
          language_probability?: number | null;
          request_id?: string | null;
          duration?: number;
        };

        return transcriptionSchema.parse({
          text: payload.transcript ?? payload.text ?? '',
          language: payload.language_code ?? payload.language ?? null,
          confidence: payload.language_probability ?? null,
          requestId: payload.request_id ?? null,
          durationSeconds: payload.duration,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
