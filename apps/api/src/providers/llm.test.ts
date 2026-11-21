import { describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleLlm } from './llm.js';
import type { ProviderHttpError } from './llm.js';

describe('OpenAI-compatible LLM adapter', () => {
  it('sends chat messages and parses tool calls', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      });

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe('test-model');
      expect(body.tools).toHaveLength(1);

      return new Response(
        JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [{
                id: 'call_1',
                function: { name: 'items.setPrice', arguments: '{"itemId":"r1","price":50}' },
              }],
            },
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const llm = createOpenAiCompatibleLlm({
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'secret',
      model: 'test-model',
      fetchImpl,
    });

    const result = await llm.chat({
      messages: [{ role: 'user', content: 'Set rice price to 50' }],
      tools: [{
        name: 'items.setPrice',
        description: 'Set an item price',
        parameters: { type: 'object', properties: {} },
      }],
    });

    expect(result).toEqual({
      content: null,
      toolCalls: [{
        id: 'call_1',
        name: 'items.setPrice',
        arguments: { itemId: 'r1', price: 50 },
      }],
      finishReason: 'tool_calls',
    });
  });

  it('turns an unsuccessful provider response into a typed HTTP error', async () => {
    const llm = createOpenAiCompatibleLlm({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'secret',
      model: 'test-model',
      fetchImpl: async () => new Response('no credits', { status: 402 }),
    });

    await expect(llm.chat({ messages: [{ role: 'user', content: 'hello' }] })).rejects.toMatchObject({
      name: 'ProviderHttpError',
      provider: 'llm',
      status: 402,
    } satisfies Partial<ProviderHttpError>);
  });
});
