// deno-lint-ignore-file no-explicit-any
import { StreamTextResult } from "ai";

export async function logAgentStream(result: StreamTextResult<any, any, any>) {
  for await (const part of result.stream) {
    switch (part.type) {
      case "reasoning-start":
        // optionally show provider-exposed reasoning summary
        break;

      case "reasoning-delta":
        // optionally show provider-exposed reasoning summary
        break;

      case "tool-call":
        if (part.toolName === "prompt") {
          console.info("◆ Need some clarification");
        } else {
          console.info(`◆ Running ${part.toolName}`);
        }

        break;

      case "tool-result":
        break;

      case "text-start":
        // optionally show provider-exposed reasoning summary
        break;

      case "text-delta": {
        // optionally show provider-exposed reasoning summary
        break;
      }

      case "finish":
        break;
    }
  }
}
