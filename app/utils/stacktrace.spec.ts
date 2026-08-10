import { describe, expect, it } from 'vitest';
import { cleanStackTrace } from './stacktrace';

describe('cleanStackTrace', () => {
  const webcontainerHost = 'https://abc123-xyz.webcontainer-api.io';

  it('replaces a single webcontainer URL with its relative path', () => {
    const input = `    at foo (${webcontainerHost}/app/utils/bar.ts:10:5)`;
    const result = cleanStackTrace(input);
    expect(result).toBe('    at foo (app/utils/bar.ts:10:5)');
  });

  it('preserves the leading and trailing characters around the URL', () => {
    const input = `Error: something broke at (${webcontainerHost}/src/index.ts:1:1) [extra]`;
    const result = cleanStackTrace(input);
    expect(result).toBe('Error: something broke at (src/index.ts:1:1) [extra]');
  });

  it('processes each line of a multi-line stack trace independently', () => {
    const input = [
      `Error: boom`,
      `    at fnOne (${webcontainerHost}/a.ts:1:1)`,
      `    at fnTwo (${webcontainerHost}/b.ts:2:2)`,
    ].join('\n');
    const result = cleanStackTrace(input);
    expect(result).toBe('Error: boom\n    at fnOne (a.ts:1:1)\n    at fnTwo (b.ts:2:2)');
  });

  it('leaves non-webcontainer URLs unchanged', () => {
    const input = `    at foo (https://cdn.example.com/app/utils/bar.ts:10:5)`;
    expect(cleanStackTrace(input)).toBe(input);
  });

  it('leaves plain file paths unchanged', () => {
    const input = `    at foo (/home/project/app/utils/bar.ts:10:5)`;
    expect(cleanStackTrace(input)).toBe(input);
  });

  it('returns an empty string for an empty input', () => {
    expect(cleanStackTrace('')).toBe('');
  });

  it('handles a webcontainer root URL (no path after host)', () => {
    const input = `    at foo (${webcontainerHost})`;
    const result = cleanStackTrace(input);
    // The URL regex requires a path segment (/...); a bare host won't match the
    // line-level replace regex, so the line stays unchanged.
    expect(result).toBe(input);
  });

  it('leaves a webcontainer URL with only a trailing slash unchanged (regex needs a path char)', () => {
    // The line-level replace regex requires at least one non-whitespace,
    // non-closing-paren character after the host slash. A bare trailing slash
    // does not satisfy that, so the URL is left untouched.
    const input = `    at foo (${webcontainerHost}/)`;
    expect(cleanStackTrace(input)).toBe(input);
  });

  it('preserves lines that have no URL at all', () => {
    const input = `Error: something failed\n    at foo (${webcontainerHost}/x.ts:1:1)`;
    const result = cleanStackTrace(input);
    expect(result).toBe('Error: something failed\n    at foo (x.ts:1:1)');
  });

  it('handles http (non-ssl) webcontainer URLs', () => {
    const input = `    at foo (http://abc123-xyz.webcontainer-api.io/app/main.ts:5:1)`;
    const result = cleanStackTrace(input);
    expect(result).toBe('    at foo (app/main.ts:5:1)');
  });

  it('handles multiple webcontainer URLs on the same line', () => {
    const input = `    at foo (${webcontainerHost}/a.ts:1:1) and (${webcontainerHost}/b.ts:2:2)`;
    const result = cleanStackTrace(input);
    expect(result).toBe('    at foo (a.ts:1:1) and (b.ts:2:2)');
  });
});