import { parseQueryParams } from "../common/parseQueryParams.ts";

export const paramsAsJson = <T extends Record<string, string>>(
  req: Request,
): T => {
  if ("_params" in req) return req._params as T;
  return {} as T;
};

export const queryAsJson = (req: Request, opts?: qs.IParseOptions) => {
  const url = new URL(req.url);

  return parseQueryParams(url.search, opts);
};

export const bodyAsJson = (req: Request) => req.json();
