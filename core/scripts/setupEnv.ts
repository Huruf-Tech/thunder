import { Input } from "@cliffy/prompt";
import { parse } from "@std/dotenv";

async function setupEnvironment() {
  let envContent = "";
  let envExists = false;

  try {
    envContent = await Deno.readTextFile(".env");
    envExists = true;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  if (envExists) {
    const parsedEnv = parse(envContent);

    if (parsedEnv["DATABASE_URL"]) {
      return;
    }
  }

  const dbUrl = await Input.prompt({
    message: "Enter Database Url (MongoDB Connection String)",
    default: "mongodb://localhost:27017/thunder",
  });

  const newEnvDbContent = `DATABASE_URL=${dbUrl}`;

  if (envExists) {
    const newLine = !envContent.endsWith("\n") ? "\n" : "";

    await Deno.writeTextFile(".env", newLine + newEnvDbContent, {
      append: true,
    });

    console.log("Appended DATABASE_URL in existing .env file");
  } else {
    await Deno.writeTextFile(".env", newEnvDbContent);
    console.log("Created .env file with DATABASE_URL");
  }
}

if (import.meta.main) {
  await setupEnvironment();
}
