// @deno-types=npm:@types/qs
import qs from "qs";

export const paramsAsJson = <T extends Record<string, string>>(
  req: Request,
): T => {
  if ("_params" in req) return req._params as T;
  return {} as T;
};

export const queryAsJson = (req: Request, opts?: qs.IParseOptions) => {
  const url = new URL(req.url);

  return qs.parse(url.search, { ignoreQueryPrefix: true, ...opts });
};

export const bodyAsJson = (req: Request) => req.json();
