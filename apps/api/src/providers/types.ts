import type {
  ChatMessage,
  ChatResponse,
  ChatToolDefinition,
  Transcription,
} from '@sauda/shared';

export interface ChatRequest {
  messages: readonly ChatMessage[];
  tools?: readonly ChatToolDefinition[];
  temperature?: number;
}

export interface LlmProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface TranscribeRequest {
  audio: Uint8Array;
  filename: string;
  mimeType: string;
  language?: string;
  mode?: TranscribeMode;
  keyterms?: readonly string[];
}

export type TranscribeMode = 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix';

export interface SttProvider {
  readonly name: string;
  transcribe(request: TranscribeRequest): Promise<Transcription>;
}

export interface ProviderFactory {
  llm(): LlmProvider;
  stt(): SttProvider;
}
