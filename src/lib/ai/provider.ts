import { config } from "@/lib/config";
import type { AIProvider } from "./types";
import { createClaudeProvider } from "./providers/claude";
import { createOpenAIProvider } from "./providers/openai";
import { createGeminiProvider } from "./providers/gemini";

/**
 * Resolve the configured AI provider. Selection is driven by AI_PROVIDER so
 * the platform can move between Claude, an OpenAI-compatible API, a local Ollama
 * model, or Gemini without any code change.
 */
export function getProvider(): AIProvider {
  switch (config.ai.provider) {
    case "openai":
      return createOpenAIProvider(false);
    case "ollama":
      return createOpenAIProvider(true);
    case "gemini":
      return createGeminiProvider();
    case "claude":
    default:
      return createClaudeProvider();
  }
}
