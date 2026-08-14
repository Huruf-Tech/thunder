import { Input } from "@cliffy/prompt";
import { parse } from "@std/dotenv";

const ENV_FILE_PATH = ".env";

const ENV_KEYS = {
  databaseUrl: "DATABASE_URL",
  baseUrl: "BASE_URL",
  secretKey: "SECRET_KEY",
} as const;

async function readEnvironmentFile(): Promise<string> {
  try {
    return await Deno.readTextFile(ENV_FILE_PATH);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return "";
    }

    throw error;
  }
}

function generateSecretKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return Uint8Array.from(bytes)
    .toBase64({
      alphabet: "base64url",
      omitPadding: true,
    });
}

function appendEnvironmentVariables(
  content: string,
  variables: Record<string, string>,
): string {
  const entries = Object.entries(variables);

  if (entries.length === 0) {
    return content;
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const newContent = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return `${content}${separator}${newContent}\n`;
}

export async function setupEnvironment(): Promise<void> {
  const currentContent = await readEnvironmentFile();
  const currentEnvironment = parse(currentContent);
  const missingVariables: Record<string, string> = {};

  if (!currentEnvironment[ENV_KEYS.databaseUrl]) {
    missingVariables[ENV_KEYS.databaseUrl] = await Input.prompt({
      message: "Enter the MongoDB connection string",
      default: "mongodb://localhost:27017/thunder",
    });
  }

  if (!currentEnvironment[ENV_KEYS.baseUrl]) {
    missingVariables[ENV_KEYS.baseUrl] = await Input.prompt({
      message: "Enter the application base URL",
      default: "http://localhost:8000",
    });
  }

  if (!currentEnvironment[ENV_KEYS.secretKey]) {
    missingVariables[ENV_KEYS.secretKey] = generateSecretKey();
  }

  if (Object.keys(missingVariables).length === 0) {
    console.log("Environment is already configured.");
    return;
  }

  const updatedContent = appendEnvironmentVariables(
    currentContent,
    missingVariables,
  );

  await Deno.writeTextFile(ENV_FILE_PATH, updatedContent);

  const addedKeys = Object.keys(missingVariables).join(", ");
  console.log(`Environment configured successfully. Added: ${addedKeys}`);
}

if (import.meta.main) {
  await setupEnvironment();
}
