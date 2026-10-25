/**
 * One transaction at a time per source account: two concurrent transactions from the same account
 * would collide on its sequence number. Roles that share a key share the lock.
 */
class Lock {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const locks = new Map<string, Lock>();

export function withAccountLock<T>(account: string, fn: () => Promise<T>): Promise<T> {
  let lock = locks.get(account);
  if (!lock) locks.set(account, (lock = new Lock()));
  return lock.run(fn);
}
