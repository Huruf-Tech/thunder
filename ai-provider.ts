import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { ModelProvider } from "@/core/agent/types.ts";
import { Env } from "@/core/utils/env.ts";

const anthropic = createAnthropic({
  apiKey: Env.getSync("ANTHROPIC_API_KEY"),
});

const google = createGoogle({
  apiKey: Env.getSync("GOOGLE_AI_API_KEY"),
});

export default {
  architect: anthropic("claude-opus-4-5"),
  engineer: anthropic("claude-sonnet-5"),
  helper: anthropic("claude-sonnet-5"),
  embedder: google.embedding("gemini-embedding-001"),
} satisfies ModelProvider;
