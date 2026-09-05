// import { parseArgs as parse } from "@std/cli/parse-args";
import { exists } from "@std/fs";
import { join } from "@std/path/join";
import { Input, Select } from "@cliffy/prompt";

import { session } from "@/core/agent/session.ts";
import { planning } from "@/core/agent/planning.ts";

export const chat = async () => {
  const planPath = join(Deno.cwd(), "./PLAN.md");

  if (await exists(planPath)) {
    await session({ projectPath: Deno.cwd() });
  } else {
    const todo = await Select.prompt({
      message: "How would you like to start?",
      options: [
        { name: "Blank (Start a new project planning)", value: "plan" },
        {
          name:
            "Review the project for context and understanding (Build on top of the existing project)",
          value: "review",
        },
      ],
    });

    if (todo === "plan") {
      const projectName = await Input.prompt("Enter the project name:");
      const projectDescription = await Input.prompt(
        "Enter the project description:",
      );

      const planMd = await planning(projectName, projectDescription);

      await Deno.writeTextFile(planPath, planMd);

      await session({ projectPath: Deno.cwd(), planMd });
    } else {
      //! Handle the case where the user wants to review the existing project

      throw new Error("Review functionality is not implemented yet.");
    }
  }
};

if (import.meta.main) {
  //   const {} = parse(Deno.args);

  await chat();

  Deno.exit();
}
