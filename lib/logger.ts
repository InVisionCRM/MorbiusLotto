// Simple logger for frontend
function toPlainObject(value: unknown): unknown {
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    // WebSocket/Event objects often stringify to {} because their properties
    // are non-enumerable. Convert known fields into a plain object.
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      const plain: Record<string, unknown> = {};

      for (const key of Object.getOwnPropertyNames(obj)) {
        // @ts-expect-error index signature
        plain[key] = obj[key];
      }
      for (const key of Object.keys(obj)) {
        plain[key] = obj[key];
      }

      if ('type' in obj) plain.type = (obj as any).type;
      if ('timeStamp' in obj) plain.timeStamp = (obj as any).timeStamp;

      const target = (obj as any).target;
      if (target && typeof target === 'object') {
        plain.target = {
          readyState: (target as any).readyState,
          url: (target as any).url,
          protocol: (target as any).protocol,
        };
      }

      return plain;
    }

    return value;
  } catch {
    return value;
  }
}

function normalizeArgs(args: unknown[]): unknown[] {
  return args.map(toPlainObject);
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${message}`, ...normalizeArgs(args));
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...normalizeArgs(args));
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...normalizeArgs(args));
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, ...normalizeArgs(args));
    }
  }
};