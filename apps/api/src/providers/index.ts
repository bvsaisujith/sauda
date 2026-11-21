import { env } from '../config.js';
import { createOpenAiCompatibleLlm } from './llm.js';
import { createSarvamCompatibleStt } from './stt.js';
import type { ProviderFactory } from './types.js';

let llmSingleton: ReturnType<typeof createOpenAiCompatibleLlm> | undefined;
let sttSingleton: ReturnType<typeof createSarvamCompatibleStt> | undefined;

export const providers: ProviderFactory = {
  llm() {
    if (!llmSingleton) {
      if (!env.LLM_API_KEY || !env.LLM_MODEL) {
        throw new Error('LLM_API_KEY and LLM_MODEL are required outside test mode');
      }

      llmSingleton = createOpenAiCompatibleLlm({
        baseUrl: env.LLM_BASE_URL,
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL,
      });
    }

    return llmSingleton;
  },

  stt() {
    if (!sttSingleton) {
      if (!env.STT_API_KEY) {
        throw new Error('STT_API_KEY is required outside test mode');
      }

      sttSingleton = createSarvamCompatibleStt({
        baseUrl: env.STT_BASE_URL,
        apiKey: env.STT_API_KEY,
        model: env.STT_MODEL,
        languages: env.STT_LANGUAGES.split(',').map((language) => language.trim()).filter(Boolean),
      });
    }

    return sttSingleton;
  },
};
