import "@/core/bootstrap.ts";
import "@/database.ts";

import { discover } from "@/core/http/discover.ts";

export default async (req: Request) => {
  const exec = await discover(req);

  return exec(req);
};
