type LogPayload = Record<string, unknown>;

function label(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

/** Thin console wrapper so log calls stay consistent and are easy to redirect later. */
export const logger = {
  info(scope: string, message: string, payload?: LogPayload): void {
    if (payload) console.info(label(scope, message), payload);
    else console.info(label(scope, message));
  },

  error(scope: string, message: string, payload?: LogPayload): void {
    if (payload) console.error(label(scope, message), payload);
    else console.error(label(scope, message));
  },
};
