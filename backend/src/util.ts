export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Caches the last result of `fn` for `ttlMs`; `reset` drops it. In-flight calls are shared. */
export function memo<T>(ttlMs: number, fn: () => Promise<T>) {
  let at = 0;
  let value: Promise<T> | undefined;
  const get = (): Promise<T> => {
    if (!value || Date.now() - at > ttlMs) {
      at = Date.now();
      const p = fn();
      value = p;
      p.catch(() => {
        if (value === p) value = undefined; // never cache a failure
      });
    }
    return value;
  };
  get.reset = () => {
    value = undefined;
  };
  return get;
}
