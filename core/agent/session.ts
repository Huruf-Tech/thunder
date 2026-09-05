import { join } from "@std/path/join";

export const session = async (
  options: { projectPath: string; planMd?: string },
) => {
  const { projectPath, planMd: newPlanMd } = options;

  const _plan = newPlanMd ??
    await Deno.readTextFile(join(projectPath, "./PLAN.md"));

  //! Implement the session logic here, such as loading the project plan, initializing the session, etc.
};
