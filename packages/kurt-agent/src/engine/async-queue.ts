/**
 * A minimal single-consumer async queue (an unbounded channel).
 *
 * Why this exists: `runLoop` exposes an `AsyncIterable<Event>`, but tools also
 * need to push events (via `ToolContext.emit`) while the loop is `await`ing
 * their execution — and you cannot `yield` from inside an awaited callback. So
 * the loop's driver and the tools both `push()` into this queue, and the single
 * consumer drains it in FIFO order. This is what makes the Phase 7 sub-agent
 * event-bubbling seam work without touching the engine.
 */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  #items: T[] = [];
  #waiter: ((result: IteratorResult<T>) => void) | null = null;
  #closed = false;

  push(item: T): void {
    if (this.#closed) return;
    if (this.#waiter) {
      const resolve = this.#waiter;
      this.#waiter = null;
      resolve({ value: item, done: false });
    } else {
      this.#items.push(item);
    }
  }

  /** Mark the stream finished. Already-queued items are still drained first. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#waiter) {
      const resolve = this.#waiter;
      this.#waiter = null;
      resolve({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.#items.length > 0) {
        yield this.#items.shift() as T;
        continue;
      }
      if (this.#closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.#waiter = resolve;
      });
      if (result.done) return;
      yield result.value;
    }
  }
}
