import { chatResponseSchema, type ChatResponse } from '@sauda/shared';
import type { ChatRequest, LlmProvider } from './types.js';

export interface OpenAiCompatibleLlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized}/chat/completions`;
}

export class ProviderHttpError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
    this.provider = provider;
    this.status = status;
  }
}

export function createOpenAiCompatibleLlm(options: OpenAiCompatibleLlmOptions): LlmProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: 'openai-compatible',

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

      try {
        const response = await fetchImpl(chatCompletionsUrl(options.baseUrl), {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            messages: request.messages.map((message) => {
              const base: Record<string, unknown> = {
                role: message.role,
                content: message.content,
              };

              if (message.toolCallId !== undefined) {
                base.tool_call_id = message.toolCallId;
              }
              if (message.toolName !== undefined) {
                base.name = message.toolName;
              }

              return base;
            }),
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            ...(request.tools === undefined
              ? {}
              : {
                  tools: request.tools.map((tool) => ({
                    type: 'function',
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.parameters,
                    },
                  })),
                  tool_choice: 'auto',
                }),
          }),
        });

        if (!response.ok) {
          throw new ProviderHttpError(
            'llm',
            response.status,
            `LLM provider returned HTTP ${response.status}`,
          );
        }

        const payload = (await response.json()) as {
          choices?: Array<{
            finish_reason?: string;
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id: string;
                function: { name: string; arguments: string };
              }>;
            };
          }>;
        };

        const choice = payload.choices?.[0];
        const rawCalls = choice?.message?.tool_calls ?? [];
        const toolCalls = rawCalls.map((call) => {
          let argumentsValue: Record<string, unknown> = {};

          try {
            const parsed = JSON.parse(call.function.arguments) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              argumentsValue = parsed as Record<string, unknown>;
            }
          } catch {
            argumentsValue = {};
          }

          return { id: call.id, name: call.function.name, arguments: argumentsValue };
        });

        const finishReason =
          choice?.finish_reason === 'stop' ||
          choice?.finish_reason === 'tool_calls' ||
          choice?.finish_reason === 'length' ||
          choice?.finish_reason === 'content_filter'
            ? choice.finish_reason
            : 'unknown';

        const parsed = chatResponseSchema.parse({
          content: choice?.message?.content ?? null,
          toolCalls,
          finishReason,
        });

        return parsed satisfies ChatResponse;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
