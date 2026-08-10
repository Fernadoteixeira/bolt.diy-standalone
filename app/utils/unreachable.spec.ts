import { describe, expect, it } from 'vitest';
import { unreachable } from './unreachable';

describe('unreachable', () => {
  it('throws an error with the "Unreachable:" prefix and the provided message', () => {
    expect(() => unreachable('this code path should not execute')).toThrow(
      'Unreachable: this code path should not execute',
    );
  });

  it('throws an Error instance', () => {
    try {
      unreachable('boom');
      // Should never reach this line
      expect.unreachable('expected unreachable to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('Unreachable: boom');
    }
  });

  it('includes the message verbatim when it contains special characters', () => {
    expect(() => unreachable('path /a/b?c=d&e=f')).toThrow('Unreachable: path /a/b?c=d&e=f');
  });

  it('works with an empty string message', () => {
    expect(() => unreachable('')).toThrow('Unreachable: ');
  });

  it('has return type never so it can be used in exhaustiveness checks', () => {
    // Simulate an exhaustive switch where unreachable guards the default branch.
    type Shape = 'circle' | 'square';
    function area(shape: Shape): number {
      switch (shape) {
        case 'circle':
          return Math.PI;
        case 'square':
          return 1;
        default:
          return unreachable(shape);
      }
    }

    expect(area('circle')).toBeCloseTo(Math.PI);
    expect(area('square')).toBe(1);
  });
});