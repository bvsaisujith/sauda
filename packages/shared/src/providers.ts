import { z } from 'zod';

export const chatToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
});

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
});

export const chatToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export const chatResponseSchema = z.object({
  content: z.string().nullable(),
  toolCalls: z.array(chatToolCallSchema),
  finishReason: z.enum(['stop', 'tool_calls', 'length', 'content_filter', 'unknown']),
});

export const transcriptionSchema = z.object({
  text: z.string(),
  language: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  requestId: z.string().nullable().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});

export type ChatToolDefinition = z.infer<typeof chatToolDefinitionSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatToolCall = z.infer<typeof chatToolCallSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type Transcription = z.infer<typeof transcriptionSchema>;
