import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bufferWatchEvents } from './buffer';

describe('bufferWatchEvents', () => {
  const timeInMS = 100;

  beforeEach(() => {
    vi.useFakeTimers();
    // The source uses `self.setTimeout` (a browser global). In the Node test
    // environment `self` is not defined, so stub it to globalThis which has the
    // fake-timer-injected setTimeout.
    vi.stubGlobal('self', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should call the callback after the specified time with buffered events', async () => {
    const cb = vi.fn();
    const buffer = bufferWatchEvents(timeInMS, cb);

    buffer('event1');
    buffer('event2');

    // Callback should not be invoked before the timer fires
    expect(cb).not.toHaveBeenCalled();

    // The setTimeout callback is async (awaits `processing`), so we must use
    // the async variant to flush microtasks after advancing timers.
    await vi.advanceTimersByTimeAsync(100);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([
      ['event1'],
      ['event2'],
    ]);
  });

  it('should buffer all events within the time window into a single batch', async () => {
    const cb = vi.fn();
    const buffer = bufferWatchEvents(50, cb);

    for (let i = 0; i < 5; i++) {
      buffer(i);
    }

    await vi.advanceTimersByTimeAsync(50);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([
      [0],
      [1],
      [2],
      [3],
      [4],
    ]);
  });

  it('should not call the callback when no events were buffered', () => {
    const cb = vi.fn();
    bufferWatchEvents(100, cb);

    vi.advanceTimersByTime(100);

    expect(cb).not.toHaveBeenCalled();
  });

  it('should reset the timer window after each batch is processed', async () => {
    const cb = vi.fn();
    const buffer = bufferWatchEvents(100, cb);

    // First batch
    buffer('a');
    await vi.advanceTimersByTimeAsync(100);
    expect(cb).toHaveBeenCalledTimes(1);

    // Second batch — a new timer should be scheduled
    buffer('b');
    await vi.advanceTimersByTimeAsync(100);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith([['b']]);
  });

  it('should pass through multi-argument events', async () => {
    const cb = vi.fn();
    const buffer = bufferWatchEvents<[string, number]>(80, cb);

    buffer('count', 42);
    buffer('count', 99);

    await vi.advanceTimersByTimeAsync(80);

    expect(cb).toHaveBeenCalledWith([
      ['count', 42],
      ['count', 99],
    ]);
  });

  it('should process batches in order even if the callback is async', async () => {
    const results: string[] = [];
    const cb = vi.fn(async (events: [string][]) => {
      // Simulate async work
      await Promise.resolve();
      results.push(events.map((e) => e[0]).join(','));
    });

    const buffer = bufferWatchEvents(50, cb);

    buffer('a1');
    buffer('a2');

    vi.advanceTimersByTime(50);

    // Wait for the microtask queue to flush
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));

    buffer('b1');

    vi.advanceTimersByTime(50);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));

    expect(results).toEqual(['a1,a2', 'b1']);
  });

  it('should schedule a new timer only when one is not already active', async () => {
    const cb = vi.fn();
    const buffer = bufferWatchEvents(100, cb);

    buffer('first');
    buffer('second'); // should not create a second timer

    await vi.advanceTimersByTimeAsync(50);

    buffer('third'); // timer already fired or is active — still within window

    // Only one timer should have been set at this point
    await vi.advanceTimersByTimeAsync(50);

    expect(cb).toHaveBeenCalledTimes(1);
  });
});