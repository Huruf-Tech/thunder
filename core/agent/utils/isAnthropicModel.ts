import { LanguageModel } from "ai";

export function isAnthropicModel(model: LanguageModel): boolean {
  if (typeof model === "string") {
    return (
      model.startsWith("anthropic/") ||
      model.toLowerCase().includes("claude")
    );
  }

  return (
    model.modelId.toLowerCase().includes("claude") ||
    model.provider.toLowerCase().includes("anthropic")
  );
}
