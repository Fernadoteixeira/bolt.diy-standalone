import { describe, expect, it } from 'vitest';
import { stripIndents } from './stripIndent';

describe('stripIndents', () => {
  it('trims leading indentation from each line (plain string)', () => {
    const result = stripIndents('    line one\n      line two\n    line three');
    expect(result).toBe('line one\nline two\nline three');
  });

  it('trims trailing whitespace from the overall string', () => {
    const result = stripIndents('  hello  \n  world  ');
    expect(result).toBe('hello\nworld');
  });

  it('strips a single trailing newline at the end of the string', () => {
    const result = stripIndents('line one\nline two\n');
    expect(result).toBe('line one\nline two');
  });

  it('strips a trailing carriage-return + newline pair', () => {
    const result = stripIndents('line one\nline two\r\n');
    expect(result).toBe('line one\nline two');
  });

  it('supports tagged template literal with interpolation', () => {
    const name = 'World';
    const result = stripIndents`Hello ${name}
      How are you?`;
    expect(result).toBe('Hello World\nHow are you?');
  });

  it('handles tagged template with multiple interpolations', () => {
    const a = 'foo';
    const b = 'bar';
    const result = stripIndents`  ${a}
    ${b}`;
    expect(result).toBe('foo\nbar');
  });

  it('returns an empty string unchanged', () => {
    expect(stripIndents('')).toBe('');
  });

  it('handles a single line with no indentation', () => {
    expect(stripIndents('hello')).toBe('hello');
  });

  it('preserves internal blank lines (as trimmed empty lines)', () => {
    const result = stripIndents('line one\n\n  line two');
    // The blank line is trimmed to an empty string, so it is preserved
    expect(result).toBe('line one\n\nline two');
  });

  it('trims leading whitespace from the start of the first line', () => {
    expect(stripIndents('   hello')).toBe('hello');
  });

  it('handles a tagged template with no interpolations', () => {
    const result = stripIndents`  first
    second`;
    expect(result).toBe('first\nsecond');
  });
});