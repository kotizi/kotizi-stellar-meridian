/** Runs the tasks it's given one at a time, in order; a task that fails doesn't stop the next. */
export function createSerialQueue() {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
}
