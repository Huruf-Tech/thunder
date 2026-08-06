// deno-lint-ignore-file no-explicit-any
export const circularReplacer = () => {
  const seen = new WeakSet();
  return (_: any, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        try {
          JSON.stringify(value);
        } catch {
          return "[Circular]";
        }
      }
      seen.add(value);
    }
    return value;
  };
};

export const deepObjectToFlatten = (
  obj: Record<string, any>,
  prefix = "",
): Record<string, any> => {
  return Object.keys(obj).reduce((acc, key) => {
    const propName = prefix ? `${prefix}.${key}` : key;
    if (
      typeof obj[key] === "object" &&
      obj[key] !== null &&
      obj[key].constructor === Object
    ) {
      return { ...acc, ...deepObjectToFlatten(obj[key], propName) };
    } else return { ...acc, [propName]: obj[key] };
  }, {});
};

export const dotNotationToDeepObject = (obj: Record<string, any>) => {
  const result: Record<string, any> = {};

  Object.keys(obj).forEach((key) => {
    const keys = key.split(".");
    let currentObj = result;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];

      if (i === keys.length - 1) {
        currentObj[k] = obj[key];
      } else {
        if (!currentObj[k]) {
          currentObj[k] = {};
        }
        currentObj = currentObj[k];
      }
    }
  });

  return result;
};

export const assignDeepValues = (
  keys: string[],
  deepObject: any,
  options?: {
    modifier?: (value: any, key: string, parent: any, index: number) => any;
    resolver?: (value: any, key: string, parent: any, index: number) => any;
  },
) => {
  const Result: any = {};

  keys.forEach((key, index) => {
    let value = deepObject;
    let parent: any = undefined;

    const NestedKeys = key.split(".");

    let exists = true;

    for (const NestedKey of NestedKeys) {
      const Target = typeof options?.resolver === "function"
        ? options.resolver(value[NestedKey], NestedKey, value, index)
        : value[NestedKey];

      if (Target !== undefined) {
        parent = value;
        value = Target;
      } else {
        exists = false;
        break;
      }
    }

    const Value = exists ? value : undefined;

    Result[key] = typeof options?.modifier === "function"
      ? options?.modifier(Value, key, parent, index)
      : Value;
  });

  return Result;
};

export const pickProps = (
  keys: string[],
  object: any,
  modifier?: (value: any, key: string) => any,
) => {
  const Result: any = {};

  for (const Key in object) {
    if (keys.includes(Key)) {
      Result[Key] = typeof modifier === "function"
        ? modifier(object[Key], Key)
        : object[Key];
    }
  }

  return Result;
};

export const omitProps = (
  keys: string[],
  object: any,
  modifier?: (value: any, key: string) => any,
) => {
  const Result: any = {};

  for (const Key in object) {
    if (!keys.includes(Key)) {
      Result[Key] = typeof modifier === "function"
        ? modifier(object[Key], Key)
        : object[Key];
    }
  }

  return Result;
};

export const getObjectValue = (
  obj: Record<string, any> | null | undefined,
  keys: string | string[],
  options?: {
    child?: boolean;
  },
): {
  plural?: true;
  value?: any;
} => {
  if (!obj) return {};

  const Keys = keys instanceof Array ? [...keys] : keys.split(".");
  const key = Keys.shift();

  if (!key || obj[key] === undefined) {
    return {};
  }

  if (Keys.length) {
    if (!options?.child && obj[key] instanceof Array && isNaN(+Keys[0])) {
      return {
        plural: true,
        value: obj[key].map((t) =>
          getObjectValue(t, Keys, { child: true }).value
        ),
      };
    }

    return getObjectValue(obj[key], Keys);
  }

  return {
    value: obj[key],
  };
};

export const setObjectValue = <T extends Record<string, any>, O = T>(
  obj: T,
  keys: string | string[],
  value: any,
): O => {
  const Keys = keys instanceof Array ? keys : keys.split(".");

  let current = obj;

  Keys.forEach((k: keyof T, index) => {
    if (index === keys.length - 1) current[k] = value;
    else current = current[k] ??= {} as T[string];
  });

  return obj as unknown as O;
};
