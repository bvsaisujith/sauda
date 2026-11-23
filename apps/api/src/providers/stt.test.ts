import { describe, expect, it, vi } from 'vitest';
import { createSarvamCompatibleStt } from './stt.js';

describe('Sarvam-compatible STT adapter', () => {
  it('posts multipart audio with translate mode and auto-detect', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://api.sarvam.ai/speech-to-text');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'api-subscription-key': 'stt-secret' });
      expect(init?.body).toBeInstanceOf(FormData);

      const form = init?.body as FormData;
      expect(form.get('model')).toBe('saaras:v4');
      expect(form.get('mode')).toBe('translate');
      expect(form.get('language_code')).toBe('unknown');
      expect(form.get('with_timestamps')).toBe('false');
      expect(form.get('keyterms')).toBe(JSON.stringify(['Sauda', 'Atta']));

      return new Response(
        JSON.stringify({
          transcript: 'Rice is fifty rupees',
          language_code: 'hi-IN',
          language_probability: 0.97,
          request_id: 'req_123',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const stt = createSarvamCompatibleStt({
      baseUrl: 'https://api.sarvam.ai/',
      apiKey: 'stt-secret',
      model: 'saaras:v4',
      fetchImpl,
    });

    await expect(
      stt.transcribe({
        audio: new Uint8Array([1, 2, 3]),
        filename: 'speech.webm',
        mimeType: 'audio/webm',
        keyterms: ['Sauda', 'Atta'],
      }),
    ).resolves.toEqual({
      text: 'Rice is fifty rupees',
      language: 'hi-IN',
      confidence: 0.97,
      requestId: 'req_123',
    });
  });

  it('omits keyterms when none are supplied', async () => {
    let form: FormData | undefined;

    const stt = createSarvamCompatibleStt({
      baseUrl: 'https://api.sarvam.ai',
      apiKey: 'stt-secret',
      model: 'saaras:v4',
      fetchImpl: async (_input, init) => {
        form = init?.body as FormData;
        return new Response(JSON.stringify({ transcript: 'ok' }), { status: 200 });
      },
    });

    await stt.transcribe({
      audio: new Uint8Array([1]),
      filename: 'speech.wav',
      mimeType: 'audio/wav',
    });

    expect(form?.get('keyterms')).toBeNull();
  });

  it('turns provider failures into HTTP provider errors', async () => {
    const stt = createSarvamCompatibleStt({
      baseUrl: 'https://api.sarvam.ai',
      apiKey: 'stt-secret',
      model: 'saaras:v4',
      fetchImpl: async () => new Response('bad request', { status: 403 }),
    });

    await expect(
      stt.transcribe({
        audio: new Uint8Array([1]),
        filename: 'speech.wav',
        mimeType: 'audio/wav',
      }),
    ).rejects.toMatchObject({ provider: 'stt', status: 403 });
  });
});
