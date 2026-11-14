// deno-lint-ignore-file no-explicit-any ban-ts-comment
import { TRouter } from "@/core/http/router.ts";
import z from "zod";
import { bodyAsJson, paramsAsJson, queryAsJson } from "@/core/http/utils.ts";
import {
  ClientSession,
  Collection,
  DeleteResult,
  ObjectId,
  UpdateResult,
  WithId,
} from "mongodb";
import { parseDate } from "chrono-node";
import { Response } from "@/core/http/response.ts";
import { isDuplicateKeyError, mongodb } from "@/database.ts";
import { deepObjectToFlatten } from "@/core/utils/objectUtils.ts";

export type TCrudDetails<
  T extends z.ZodObject,
  I extends z.ZodObject,
  U extends z.ZodObject,
> = {
  router: TRouter & {
    metadata?: Record<string, unknown>;
  };
  schema: T;
  model: Collection<z.output<T>>;
  insertSchema?: I;
  updateSchema?: U;
};

export type TCrudIsolation<T> = (
  req: Request,
  action: "create" | "get" | "update" | "del" | "count",
) =>
  | {
    [K in keyof T]?: unknown;
  }
  | Promise<
    {
      [K in keyof T]?: unknown;
    }
  >;

export type TCrudProjection<T> =
  & {
    [K in keyof T]?: number;
  }
  & {
    [K in string]?: number;
  };

export type TCrudOptions<
  T extends z.ZodObject,
  I extends z.ZodObject = T,
  U extends z.ZodObject = I,
  D = z.output<T>,
  PD = Partial<D>,
> = {
  disable?: {
    create?: boolean;
    get?: boolean;
    count?: boolean;
    update?: boolean;
    del?: boolean;
  };
  projection?: TCrudProjection<D> | Array<TCrudProjection<D>>;
  isolationFields?: TCrudIsolation<D>;
  /** Answer a unique-index clash on create or update with this 400 instead of a 500. */
  duplicateMessage?: string;
  /** Run writes with hooks inside a transaction (default true). Turn off when hooks only notify. */
  transaction?: boolean;
  /**
   * What clients may filter, sort and facet on, and how much they may read at once. Each is opt-in:
   * left out, anything goes (as before). Set them on public routes so filters can't probe private
   * fields or run costly patterns. See `TListRules`.
   */
  list?: TListRules;
  hooks?: {
    beforeCreate?: (opts: {
      data: z.output<I> & { _id?: ObjectId };
      session?: ClientSession;
    }, req: Request) => PD | void | Promise<PD | void>;
    afterCreate?: (
      opts: {
        results: WithId<D>;
        data: z.output<I> & { _id?: ObjectId };
        session?: ClientSession;
      },
      req: Request,
    ) => void | Promise<void>;
    beforeUpdate?: (
      opts: {
        _id: ObjectId;
        data: Partial<z.output<U>>;
        session?: ClientSession;
      },
      req: Request,
    ) => PD | void | Promise<PD | void>;
    afterUpdate?: (
      opts: {
        results: UpdateResult<Partial<D>>;
        _id: ObjectId;
        data: Partial<z.output<U>>;
        session?: ClientSession;
      },
      req: Request,
    ) => void | Promise<void>;
    beforeDel?: (
      opts: { _id: ObjectId; session?: ClientSession },
      req: Request,
    ) => void | Promise<void>;
    afterDel?: (
      opts: { _id: ObjectId; results: DeleteResult; session?: ClientSession },
      req: Request,
    ) => void | Promise<void>;
  };
};

const resolveJSONSchemaType = (ctx: {
  zodSchema: z.z.core.$ZodTypes;
  jsonSchema: z.z.core.JSONSchema.BaseSchema;
  path: (string | number)[];
}) => {
  if (ctx.zodSchema instanceof z.ZodDate) {
    ctx.jsonSchema.type = "string";
    ctx.jsonSchema.format = "date-time";
  }
};

export const $objectId = z.preprocess((val) => {
  if (val instanceof ObjectId) return val;

  if (typeof val === "string" && ObjectId.isValid(val)) {
    return new ObjectId(val);
  }

  return val;
}, z.instanceof(ObjectId)).meta({ tsType: "string" });

const emptyArray: any[] = [];

const $idString = z.string().refine((id) => ObjectId.isValid(id), {
  message: "Invalid id",
});

/** A unique-index clash becomes a 400 with a message for people; anything else is rethrown. */
const refuseDuplicate = (message?: string) => (error: unknown): never => {
  if (isDuplicateKeyError(error)) {
    throw Response.badRequest(
      message ?? "Something with these details already exists.",
    );
  }

  throw error;
};

/** Runs a write, in a transaction when it has hooks (unless `transaction: false`). */
const runWrite = <R>(
  inTransaction: boolean,
  exec: (session?: ClientSession) => Promise<R>,
): Promise<R> =>
  inTransaction
    ? mongodb.withSession((_) => _.withTransaction(exec)) as Promise<R>
    : exec();

export type TFilterOperator =
  | "$exists"
  | "$eq"
  | "$ne"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$mod"
  | "$regex"
  | "$in"
  | "$nin"
  | "$all"
  | "$elemMatch";

/** A facet a list can count: each value with how many match, or the lowest and highest value. */
export type TFacetRule = {
  type: "values" | "range";
  /** The field it reads (dot path), e.g. "vendor", "price", "variants.options". */
  path: string;
  /** Array fields to unwind first, outermost first (e.g. ["variants", "variants.options"]). */
  unwind?: string[];
  /**
   * Top-level filter fields left out when counting this facet, so choosing a value still shows the
   * others' counts (multi-select). Defaults to the facet's own path.
   */
  exclude?: string[];
  /** Most values returned (default 100). */
  limit?: number;
};

export type TListRules = {
  /**
   * Fields clients may filter on and the operators allowed on each. Fields inside $elemMatch are
   * named in full ("variants.available"). Left out: any field and operator.
   */
  filterable?: Record<string, readonly TFilterOperator[]>;
  /** Fields clients may sort on (`_id` always; `_score` with text search). Left out: any. */
  sortable?: readonly string[];
  /** Facets clients may ask for, by name. */
  facetable?: Record<string, TFacetRule>;
  /** The most results one request may read (the default limit becomes this). */
  maxLimit?: number;
  /** Allow `search` (MongoDB $text: the collection needs a text index). */
  textSearch?: boolean;
};

/** Refuses filters on fields or with operators the rules don't allow (a 400 naming the first). */
export const assertFilterable = (
  filters: z.output<typeof filtersSchema> | undefined,
  rules: TListRules | undefined,
  prefix = "",
) => {
  if (!filters || !rules?.filterable) return;
  const allowed = rules.filterable;
  for (const [key, expr] of Object.entries(filters)) {
    if (key === "$and" || key === "$or") {
      for (const part of expr as z.output<typeof filtersSchema>[]) {
        assertFilterable(part, rules, prefix);
      }
      continue;
    }
    const field = prefix + key;
    const ops = allowed[field];
    if (!ops) {
      throw Response.badRequest(`Filtering on "${field}" isn't allowed.`);
    }
    const check = (expression: Record<string, unknown>) => {
      for (const [operator, value] of Object.entries(expression)) {
        if (operator === "$not") {
          check(value as Record<string, unknown>);
          continue;
        }
        if (!ops.includes(operator as TFilterOperator)) {
          throw Response.badRequest(
            `The ${operator} filter isn't allowed on "${field}".`,
          );
        }
        if (operator === "$elemMatch") {
          assertFilterable(
            value as z.output<typeof filtersSchema>,
            rules,
            `${field}.`,
          );
        }
      }
    };
    check(expr as Record<string, unknown>);
  }
};

/** Refuses sorting on fields the rules don't allow. */
export const assertSortable = (
  sort: Record<string, number> | undefined,
  rules: TListRules | undefined,
) => {
  if (!sort) return;
  for (const key of Object.keys(sort)) {
    // `_score` is relevance only where text search is on; elsewhere it's a field, as before.
    if (key === "_id" || (key === "_score" && rules?.textSearch)) continue;
    if (!rules?.sortable) continue;
    if (!rules.sortable.includes(key)) {
      throw Response.badRequest(`Sorting by "${key}" isn't allowed.`);
    }
  }
};

/** A sort stage; while searching, `_score` is relevance. */
const sortStage = (sort: Record<string, number>, searching: boolean) => ({
  $sort: Object.fromEntries(
    Object.entries(sort).map((
      [key, direction],
    ) => [searching && key === "_score" ? "score" : key, direction]),
  ),
});

/**
 * `$text` for a search (in the first $match, as MongoDB requires). Routes without text search ignore
 * `search`, as they did before it existed.
 */
export const textSearchMatch = (
  query: { search?: string },
  rules: TListRules | undefined,
) =>
  query.search && rules?.textSearch ? { $text: { $search: query.search } } : {};

/** Whether a list query asks for facets the route offers (routes without facets ignore them). */
export const wantsFacets = (
  query: { facets?: string[] },
  rules: TListRules | undefined,
) => !!(query.facets?.length && rules?.facetable);

/**
 * The list's stages after the store's own $match: the client's filters, sort and page, plus (when
 * asked) facets, in the same aggregation. Checks the query against the rules first. With facets it
 * returns ONE row: `{ results, facets }`; read it with `readListRow`. Without, rows are the results,
 * as before. (How many match in all is the separate count endpoint's job.)
 */
export const listPipeline = (
  query: z.infer<typeof paginationSchema>,
  rules?: TListRules,
) => {
  assertFilterable(query.filters, rules);
  assertFilterable(query.subFilters, rules);
  assertSortable(query.sort, rules);
  const limit = rules?.maxLimit
    ? Math.min(query.limit ?? rules.maxLimit, rules.maxLimit)
    : query.limit;
  const facets = wantsFacets(query, rules) ? query.facets! : [];
  for (const name of facets) {
    if (!rules?.facetable?.[name]) {
      throw Response.badRequest(`There's no "${name}" facet here.`);
    }
  }
  const searching = !!(query.search && rules?.textSearch);
  // A search with no sort of its own is ordered by relevance.
  const sort = searching && !query.sort
    ? { score: { $meta: "textScore" } }
    : null;
  const scoring = searching
    ? [{ $addFields: { score: { $meta: "textScore" } } }]
    : emptyArray;
  const matches = (filters?: z.output<typeof filtersSchema>) => [
    ...(filters ? [{ $match: normalizeFilters(filters) }] : emptyArray),
    ...(query.subFilters
      ? [{ $match: normalizeFilters(query.subFilters) }]
      : emptyArray),
  ];
  const page = [
    ...scoring,
    ...(sort
      ? [{ $sort: sort }]
      : query.sort
      ? [sortStage(query.sort, searching)]
      : emptyArray),
    ...(query.offset ? [{ $skip: query.offset }] : emptyArray),
    ...(limit ? [{ $limit: limit }] : emptyArray),
    ...(query.project ? [{ $project: query.project }] : emptyArray),
  ];
  if (!facets.length) {
    return [...matches(query.filters), ...page];
  }

  // A facet counts with every filter but its own (multi-select): top-level filter fields only.
  const without = (exclude: string[]) => {
    const filters = query.filters as Record<string, unknown> | undefined;
    if (!filters || "$and" in filters || "$or" in filters) return query.filters;
    return Object.fromEntries(
      Object.entries(filters).filter(([key]) => !exclude.includes(key)),
    ) as z.output<typeof filtersSchema>;
  };
  const facetStages = Object.fromEntries(facets.map((name) => {
    const rule = rules!.facetable![name];
    const field = `$${rule.path}`;
    const unwind = (rule.unwind ?? []).map((path) => ({ $unwind: `$${path}` }));
    return [
      `facet:${name}`,
      [
        ...matches(without(rule.exclude ?? [rule.path])),
        ...(rule.type === "range"
          ? [{
            $group: { _id: null, min: { $min: field }, max: { $max: field } },
          }]
          : [
            ...unwind,
            // Each document counts once per value, however many of its elements have it.
            { $group: { _id: { value: field, doc: "$_id" } } },
            { $group: { _id: "$_id.value", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: rule.limit ?? 100 },
          ]),
      ],
    ];
  }));
  return [
    {
      $facet: {
        results: [...matches(query.filters), ...page],
        ...facetStages,
      },
    },
  ];
};

export type TListFacets = Record<
  string,
  { value: unknown; count: number }[] | { min: unknown; max: unknown }
>;

/** The one row a list pipeline with facets returns, as `{ results, facets }`. */
export const readListRow = <R>(
  row: Record<string, any> | undefined,
  query: z.infer<typeof paginationSchema>,
  rules?: TListRules,
): { results: R[]; facets?: TListFacets } => ({
  results: (row?.results ?? []) as R[],
  ...(wantsFacets(query, rules)
    ? {
      facets: Object.fromEntries(query.facets!.map((name) => {
        const rows = (row?.[`facet:${name}`] ?? []) as any[];
        return [
          name,
          rules?.facetable?.[name]?.type === "range"
            ? { min: rows[0]?.min ?? null, max: rows[0]?.max ?? null }
            : rows.map((item) => ({ value: item._id, count: item.count })),
        ];
      })),
    }
    : {}),
});

export const paginatedAggregation = (
  query: z.infer<typeof paginationSchema>,
) => [
  ...(query.filters
    ? [{
      $match: normalizeFilters(query.filters),
    }]
    : emptyArray),
  ...(query.subFilters
    ? [{
      $match: normalizeFilters(query.subFilters),
    }]
    : emptyArray),
  ...(query.sort ? [{ $sort: query.sort }] : emptyArray),
  ...(query.offset ? [{ $skip: query.offset }] : emptyArray),
  ...(query.limit ? [{ $limit: query.limit }] : emptyArray),
  ...(query.project ? [{ $project: query.project }] : emptyArray),
];

export const createCRUD = <
  T extends z.ZodObject,
  I extends z.ZodObject = T,
  U extends z.ZodObject = I,
>(
  details: TCrudDetails<T, I, U>,
  opts?: TCrudOptions<T, I, U>,
) => {
  details.router.metadata = {
    crud: {
      schema: details.schema.toJSONSchema({
        io: "output",
        unrepresentable: "any",
        override: resolveJSONSchemaType,
      }),
      insertSchema: details.insertSchema?.toJSONSchema({
        io: "input",
        unrepresentable: "any",
        override: resolveJSONSchemaType,
      }),
      updateSchema: details.updateSchema?.toJSONSchema({
        io: "input",
        unrepresentable: "any",
        override: resolveJSONSchemaType,
      }),
    },
    ...details.router.metadata,
  };

  const projectionStages = opts?.projection
    ? Array.isArray(opts.projection)
      ? opts.projection.map(($project) => ({ $project }))
      : [{ $project: opts.projection }]
    : emptyArray;

  if (!opts?.disable?.create) {
    details.router.post("/", function create() {
      const $body = details.insertSchema ?? details.schema;
      const $return = z.object({
        _id: z.string(),
      });

      return {
        shape: () => ({
          body: $body,
          return: $return,
        }),
        handler: async (req: Request) => {
          const body = $body.parse(await bodyAsJson(req)) as any;

          const exec = async (session?: ClientSession) => {
            const data = (await opts?.hooks?.beforeCreate?.(
              { data: body, session },
              req,
            )) ?? body;

            const dataToInsert = details.schema.parse({
              ...data,
              ...(await opts?.isolationFields?.(req, "create")),
            }) as any;

            const { insertedId } = await details.model.insertOne(
              dataToInsert,
              { session },
            );

            await opts?.hooks?.afterCreate?.({
              data: body,
              results: { _id: insertedId, ...dataToInsert },
              session,
            }, req);

            return { insertedId };
          };

          const { insertedId } = await runWrite(
            !!(opts?.hooks?.beforeCreate || opts?.hooks?.afterCreate) &&
              opts?.transaction !== false,
            exec,
          ).catch(refuseDuplicate(opts?.duplicateMessage));

          return Response.json({
            _id: insertedId.toString(),
          });
        },
      };
    });
  }

  if (!opts?.disable?.count) {
    details.router.get("/count", function count() {
      const $query = paginationSchema.pick({
        filters: true,
        subFilters: true,
        search: true,
      });
      const $return = z.object({
        count: z.number(),
      });

      return {
        shape: () => ({
          query: $query,
          return: $return,
        }),
        handler: async (req: Request) => {
          const query = $query.parse(queryAsJson(req));
          assertFilterable(query.filters, opts?.list);
          assertFilterable(query.subFilters, opts?.list);

          // Same stages as GET: client filters run after the projection, so they
          // can't probe hidden fields (e.g. a regex oracle on a projected-out password)
          const [result] = await details.model.aggregate<{ count: number }>([
            {
              $match: {
                ...(await opts?.isolationFields?.(req, "count") ?? {}),
                ...textSearchMatch(query, opts?.list),
              } as any,
            },
            ...projectionStages,
            ...(query.filters
              ? [{ $match: normalizeFilters(query.filters) }]
              : emptyArray),
            ...(query.subFilters
              ? [{ $match: normalizeFilters(query.subFilters) }]
              : emptyArray),
            { $count: "count" },
          ]).toArray();

          return Response.json(
            { count: result?.count ?? 0 } satisfies z.output<typeof $return>,
          );
        },
      };
    });
  }

  if (!opts?.disable?.get) {
    details.router.get("{/:id}", function get() {
      const $params = z.object({
        id: $idString.optional(),
      });
      const $query = paginationSchema;
      const $return = z.object({
        results: z.array(details.schema.extend({
          _id: z.string(),
        })),
        facets: z.record(
          z.string(),
          z.union([
            z.array(z.object({ value: z.unknown(), count: z.number() })),
            z.object({ min: z.unknown(), max: z.unknown() }),
          ]),
        ).optional(),
      });

      return {
        shape: () => ({
          params: $params,
          query: $query,
          return: $return,
        }),
        handler: async (req: Request) => {
          const params = $params.parse(paramsAsJson(req));
          const query = $query.parse(queryAsJson(req));

          const rows = await details.model.aggregate([
            {
              $match: {
                ...(params.id ? { _id: new ObjectId(params.id) } : {}),
                ...(await opts?.isolationFields?.(req, "get")),
                ...textSearchMatch(query, opts?.list),
              } as any,
            },
            ...projectionStages,
            ...listPipeline(query, opts?.list),
          ]).toArray();

          // With facets, the list is one row; otherwise the rows are the results.
          return Response.json(
            wantsFacets(query, opts?.list)
              ? readListRow(rows[0], query, opts?.list)
              : { results: rows },
          );
        },
      };
    });
  }

  const $params = z.object({
    id: $idString,
  });

  if (!opts?.disable?.update) {
    details.router.patch("/:id", function update() {
      const $body =
        (details.updateSchema ?? details.insertSchema ?? details.schema)
          .partial();

      return {
        shape: () => ({
          params: $params,
          body: $body,
        }),
        handler: async (req: Request) => {
          const params = $params.parse(paramsAsJson(req));
          const raw = (await bodyAsJson(req)) as Record<string, unknown>;

          // Only what was sent: zod 4's .partial() still fills in defaults, which would reset fields.
          const body = Object.fromEntries(
            Object.entries($body.parse(raw) as Record<string, unknown>)
              .filter(([key]) => raw && typeof raw === "object" && key in raw),
          );

          const _id = new ObjectId(params.id);

          const exec = async (session?: ClientSession) => {
            const $set: any = await opts?.hooks?.beforeUpdate?.({
              _id,
              data: body as any,
              session,
            }, req) ?? body;

            $set.updatedAt = new Date();

            const isolation = await opts?.isolationFields?.(req, "update");

            // Isolation fields scope the update; the body must not be able to change them
            for (const key of Object.keys(isolation ?? {})) delete $set[key];

            const results = await details.model.updateOne(
              {
                _id,
                ...isolation,
              } as any,
              {
                $set,
              },
              {
                session,
              },
            );

            // Not found (or outside the isolation) is a 404 whether or not there's a hook.
            if (!results.matchedCount) {
              throw Response.notFound("No record updated!");
            }

            await opts?.hooks?.afterUpdate?.({
              _id,
              results,
              data: $set,
              session,
            }, req);
          };

          await runWrite(
            !!(opts?.hooks?.beforeUpdate || opts?.hooks?.afterUpdate) &&
              opts?.transaction !== false,
            exec,
          ).catch(refuseDuplicate(opts?.duplicateMessage));

          return Response.ok();
        },
      };
    });
  }

  if (!opts?.disable?.del) {
    details.router.del("/:id", function del() {
      return {
        shape: () => ({
          params: $params,
        }),
        handler: async (req: Request) => {
          const params = $params.parse(paramsAsJson(req));

          const _id = new ObjectId(params.id);

          const exec = async (session?: ClientSession) => {
            await opts?.hooks?.beforeDel?.({ _id, session }, req);

            const results = await details.model.deleteOne({
              _id,
              ...(await opts?.isolationFields?.(req, "del")),
            } as any, { session });

            // Not found (or outside the isolation) is a 404 whether or not there's a hook.
            if (!results.deletedCount) {
              throw Response.notFound("No record deleted!");
            }

            await opts?.hooks?.afterDel?.({
              _id,
              results,
              session,
            }, req);
          };

          await runWrite(
            !!(opts?.hooks?.beforeDel || opts?.hooks?.afterDel) &&
              opts?.transaction !== false,
            exec,
          );

          return Response.ok();
        },
      };
    });
  }
};

export const clientValueSchema = z.union([
  z.object({
    type: z.enum(
      [
        "string",
        "number",
        "boolean",
        "objectId",
        "date",
        "regex",
        "null",
      ],
    ),
    value: z.string(),
    options: z.object({
      regexFlags: z.string().optional(),
    }).optional(),
  }),
  z.string(),
]).meta({ tsLabel: "TFilterValue" });

export const $clientValue = clientValueSchema;

export const expressionSchema = z.object({
  $exists: clientValueSchema,
  $eq: clientValueSchema,
  $ne: clientValueSchema,
  $gt: clientValueSchema,
  $gte: clientValueSchema,
  $lt: clientValueSchema,
  $lte: clientValueSchema,
  $mod: z.tuple([z.coerce.number(), z.coerce.number()]),
  $regex: clientValueSchema,
  $in: z.array(clientValueSchema),
  $nin: z.array(clientValueSchema),
  $all: z.array(clientValueSchema),
  /** Matches when one element of an array satisfies every condition (e.g. the same variant). */
  $elemMatch: z.lazy((): z.ZodType<Record<string, unknown>> =>
    basicFilterSchema
  ),
}).partial().meta({ tsLabel: "TFilterExpression" });

export const $expression = expressionSchema;

export const basicFilterSchema = z.record(
  z.string().regex(/^[^$]/, "Filter field names may not start with $"),
  z.union([z.object({ $not: expressionSchema }), expressionSchema]),
).meta({ tsLabel: "TBasicFilter" });

export const $basicFilter = basicFilterSchema;

export const multiFilterSchema = z.object({
  $and: z.array(basicFilterSchema),
  $or: z.array(basicFilterSchema),
}).partial().strict().meta({ tsLabel: "TMultiFilters" });

export const $multiFilter = multiFilterSchema;

export const filtersSchema = z.union([basicFilterSchema, multiFilterSchema])
  .meta({ tsLabel: "TFilters" });

export const $filter = filtersSchema;

export const paginationSchema = z.object(
  {
    filters: filtersSchema.optional().describe("Client side filters"),
    subFilters: filtersSchema.optional().describe(
      "Client side sub-filters (Just a second layer of filters)",
    ),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(2000).default(2000),
    sort: z.record(
      z.string(),
      z.coerce.number().refine((v) => v === 1 || v === -1, {
        message: "Sort direction must be 1 or -1",
      }),
    ).default({
      _id: -1,
    })
      .describe(
        "Provide a sorting information in mongodb sort object format",
      ),
    project: z.record(
      z.string(),
      z.union([
        z.coerce.number().min(0).max(1),
        z.object({
          $slice: z.union([
            z.coerce.number(),
            z.tuple([z.coerce.number(), z.coerce.number()]),
          ]),
        }),
      ]),
    ).optional()
      .describe(
        "Provide a projection information in mongodb project object format",
      ),
    facets: z.preprocess(
      (value) => typeof value === "string" ? value.split(",") : value,
      z.array(z.string().max(100)).max(20),
    ).optional().describe(
      "Facets to count alongside the results (names the route declares facetable)",
    ),
    search: z.string().trim().max(200).optional().describe(
      "Text search (routes with text search on); sort by `_score` for relevance",
    ),
  },
).meta({ tsLabel: "TPagination" });

export const $pagination = paginationSchema;

const MAX_FILTER_PATTERN_LENGTH = 200;

const assertPatternLength = (pattern: string) => {
  if (pattern.length > MAX_FILTER_PATTERN_LENGTH) {
    throw Response.badRequest(
      `A filter pattern may not exceed ${MAX_FILTER_PATTERN_LENGTH} characters!`,
    );
  }
};

export const normalizeFilterExpression = (
  value?: string | number | boolean | z.output<typeof clientValueSchema>,
) => {
  if (typeof value === "object" && typeof value.type === "string") {
    switch (value.type) {
      case "boolean":
        return ["true", "1"].includes(value.value);

      case "date": {
        const date = value.value.startsWith("nldate:")
          ? parseDate(value.value.replace(/^nldate:/, ""))
          : new Date(value.value);

        if (!date || isNaN(date.getTime())) {
          throw Response.badRequest(`Invalid date filter "${value.value}"!`);
        }

        return date;
      }

      case "number":
        return Number(value.value);

      case "objectId":
        if (!ObjectId.isValid(value.value)) {
          throw Response.badRequest(
            `Invalid objectId filter "${value.value}"!`,
          );
        }

        return new ObjectId(value.value);

      case "regex":
        // Bounded because the pattern comes from the client and is run both
        // here and by mongod. A length cap only raises the cost of a
        // catastrophically backtracking pattern; it does not remove it.
        assertPatternLength(value.value);

        try {
          return new RegExp(value.value, value.options?.regexFlags);
        } catch {
          throw Response.badRequest(`Invalid regex filter "${value.value}"!`);
        }

      case "null":
        return null;

      default:
        return value.value;
    }
  }

  return value;
};

export const normalizeFilters = (
  filters?: z.output<typeof filtersSchema>,
  depth = 0,
): Record<string, any> => {
  if (typeof filters !== "object" || !filters) return {};
  // $and, $or and $elemMatch nest; a bound keeps a crafted filter from exhausting the stack.
  if (depth > 8) throw Response.badRequest("Filters are nested too deeply.");

  const transform = (
    expr:
      | { $not: z.output<typeof expressionSchema> }
      | z.output<typeof expressionSchema>,
  ) => {
    const newExpr: Record<string, any> = {};

    for (const [key, value] of Object.entries(expr)) {
      if (key === "$not") newExpr[key] = transform(value as any);
      else if (key === "$elemMatch") {
        newExpr[key] = normalizeFilters(
          value as z.output<typeof filtersSchema>,
          depth + 1,
        );
      } else {
        if (key === "$regex" && typeof value === "string") {
          assertPatternLength(value);
        }

        newExpr[key] = value instanceof Array
          ? value.map(normalizeFilterExpression)
          : normalizeFilterExpression(value as any);
      }
    }

    return newExpr;
  };

  const newFilters: Record<string, any> = {};

  for (const [key, expr] of Object.entries(filters)) {
    if (["$and", "$or"].includes(key)) {
      // An explicit callback: map's index must not become the depth.
      newFilters[key] = (expr as z.output<typeof filtersSchema>[]).map((
        part,
      ) => normalizeFilters(part, depth + 1));
      continue;
    }

    newFilters[key] = transform(expr);
  }

  return newFilters;
};

export const testFilters = <T extends Record<string, unknown>>(
  filters: z.output<typeof filtersSchema> | string,
  deepData: T,
) => {
  const data = deepObjectToFlatten(deepData);
  const validatedFilters = typeof filters === "string"
    ? JSON.parse(filters) as z.output<typeof filtersSchema>
    : filters;

  const testExpression = (
    expressions: z.output<typeof expressionSchema>,
    key: string,
  ) => {
    let success = true;

    for (const [operator, expression] of Object.entries(expressions)) {
      if (!success) break;

      const exists = key in data;
      const value = data[key];

      try {
        if (operator === "$elemMatch") {
          const items = Array.isArray(value) ? value : [];
          success = items.some((item) =>
            typeof item === "object" && item !== null &&
            testFilters(
              expression as z.output<typeof filtersSchema>,
              item as Record<string, unknown>,
            )
          );
        } else if (Array.isArray(expression) && operator !== "$mod") {
          const targets = expression.map(normalizeFilterExpression).map(String);

          // Arrays survive flattening intact, so compare element by element.
          // Passing one through String() yields "a,b" and matched nothing,
          // which quietly broke every rule written against an array field.
          const actual = (Array.isArray(value) ? value : [value]).map(String);

          switch (operator) {
            case "$in":
              success = actual.some((item) => targets.includes(item));
              break;
            case "$nin":
              success = !actual.some((item) => targets.includes(item));
              break;
            case "$all":
              // Mongo's $all holds when every target is present. This was
              // negated, so it held precisely when they were not.
              success = targets.every((target) => actual.includes(target));
              break;

            default:
              success = false;
              break;
          }
        } else {
          const target = Array.isArray(expression)
            ? expression // $mod: [divisor, remainder]
            : normalizeFilterExpression(expression as any);

          switch (operator) {
            case "$exists":
              success = exists === Boolean(target);
              break;
            case "$eq":
              success = String(value) === String(target);
              break;
            case "$ne":
              success = String(value) !== String(target);
              break;
            case "$gt":
              // @ts-ignore
              success = value > target;
              break;
            case "$gte":
              // @ts-ignore
              success = value >= target;
              break;
            case "$lt":
              // @ts-ignore
              success = value < target;
              break;
            case "$lte":
              // @ts-ignore
              success = value <= target;
              break;
            case "$mod":
              // @ts-ignore
              success = Number(value) % Number(target[0]) === Number(target[1]);
              break;
            case "$regex":
              // @ts-ignore
              success = RegExp(target).test(value);
              break;

            default:
              success = false;
              break;
          }
        }
      } catch {
        success = false;
      }
    }

    return success;
  };

  const testBasicFilters = (
    basicFilters: z.output<typeof basicFilterSchema>,
  ) => {
    let success = true;

    for (const [key, expression] of Object.entries(basicFilters)) {
      if (!success) break;

      if ("$not" in expression) {
        success = !testExpression(expression["$not"], key);

        continue;
      }

      success = testExpression(expression, key);
    }

    return success;
  };

  let pass = true;

  if ("$and" in validatedFilters && Array.isArray(validatedFilters["$and"])) {
    for (const filters of validatedFilters["$and"]) {
      const success = testFilters(filters, data);

      if (!success) {
        pass = false;

        break;
      }
    }
  }

  if (!pass) return false;

  if ("$or" in validatedFilters && Array.isArray(validatedFilters["$or"])) {
    for (const filters of validatedFilters["$or"]) {
      const success = testFilters(filters, data);

      if (success) return true;
    }

    return false;
  }

  if (!("$and" in validatedFilters) && !("$or" in validatedFilters)) {
    return testBasicFilters(
      validatedFilters as z.output<typeof basicFilterSchema>,
    );
  }

  // Only $and was given and every branch passed
  return pass;
};
