import { describe, expect, it } from 'vitest';
import { withResolvers } from './promises';

describe('withResolvers', () => {
  it('returns an object with resolve, reject, and promise', () => {
    const { resolve, reject, promise } = withResolvers<string>();

    expect(typeof resolve).toBe('function');
    expect(typeof reject).toBe('function');
    expect(promise).toBeInstanceOf(Promise);
  });

  it('resolves the promise when resolve is called', async () => {
    const { resolve, promise } = withResolvers<string>();
    resolve('done');
    await expect(promise).resolves.toBe('done');
  });

  it('rejects the promise when reject is called', async () => {
    const { reject, promise } = withResolvers<string>();
    reject(new Error('failed'));
    await expect(promise).rejects.toThrow('failed');
  });

  it('supports resolving with a number', async () => {
    const { resolve, promise } = withResolvers<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
  });

  it('supports resolving with an object', async () => {
    const { resolve, promise } = withResolvers<{ a: number }>();
    resolve({ a: 1 });
    await expect(promise).resolves.toEqual({ a: 1 });
  });

  it('supports rejecting with a plain value', async () => {
    const { reject, promise } = withResolvers<string>();
    reject('plain rejection');
    await expect(promise).rejects.toBe('plain rejection');
  });

  it('resolves with undefined when no argument is passed', async () => {
    const { resolve, promise } = withResolvers<void>();
    resolve();
    await expect(promise).resolves.toBeUndefined();
  });

  it('only resolves once even if resolve is called multiple times', async () => {
    const { resolve, promise } = withResolvers<string>();
    resolve('first');
    resolve('second');
    await expect(promise).resolves.toBe('first');
  });

  it('ignores resolve after reject has been called', async () => {
    const { reject, resolve, promise } = withResolvers<string>();
    reject(new Error('already rejected'));
    resolve('too late');
    await expect(promise).rejects.toThrow('already rejected');
  });
});