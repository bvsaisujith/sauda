import { describe, expect, it, vi } from 'vitest';
import { createSarvamCompatibleStt } from './stt.js';

describe('Sarvam-compatible STT adapter', () => {
  it('posts multipart audio and returns the provider-neutral transcript', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://api.sarvam.ai/speech-to-text');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'api-subscription-key': 'stt-secret' });
      expect(init?.body).toBeInstanceOf(FormData);

      const form = init?.body as FormData;
      expect(form.get('model')).toBe('saarika:v2.5');
      expect(form.get('language_code')).toBe('hi');

      return new Response(
        JSON.stringify({ transcript: 'चावल का भाव पचास', language_code: 'hi', duration: 2.4 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const stt = createSarvamCompatibleStt({
      baseUrl: 'https://api.sarvam.ai/',
      apiKey: 'stt-secret',
      model: 'saarika:v2.5',
      languages: ['hi', 'bn', 'ta'],
      fetchImpl,
    });

    await expect(stt.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      filename: 'speech.webm',
      mimeType: 'audio/webm',
      language: 'hi',
    })).resolves.toEqual({
      text: 'चावल का भाव पचास',
      language: 'hi',
      durationSeconds: 2.4,
    });
  });

  it('turns provider failures into HTTP provider errors', async () => {
    const stt = createSarvamCompatibleStt({
      baseUrl: 'https://api.sarvam.ai',
      apiKey: 'stt-secret',
      model: 'saarika:v2.5',
      languages: ['hi'],
      fetchImpl: async () => new Response('bad request', { status: 400 }),
    });

    await expect(stt.transcribe({
      audio: new Uint8Array([1]),
      filename: 'speech.wav',
      mimeType: 'audio/wav',
    })).rejects.toMatchObject({ provider: 'stt', status: 400 });
  });
});
