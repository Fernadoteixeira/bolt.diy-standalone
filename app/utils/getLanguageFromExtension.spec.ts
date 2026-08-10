import { describe, expect, it } from 'vitest';
import { getLanguageFromExtension } from './getLanguageFromExtension';

describe('getLanguageFromExtension', () => {
  it('returns "javascript" for "js"', () => {
    expect(getLanguageFromExtension('js')).toBe('javascript');
  });

  it('returns "typescript" for "ts"', () => {
    expect(getLanguageFromExtension('ts')).toBe('typescript');
  });

  it('returns "jsx" for "jsx"', () => {
    expect(getLanguageFromExtension('jsx')).toBe('jsx');
  });

  it('returns "tsx" for "tsx"', () => {
    expect(getLanguageFromExtension('tsx')).toBe('tsx');
  });

  it('returns "json" for "json"', () => {
    expect(getLanguageFromExtension('json')).toBe('json');
  });

  it('returns "html" for "html"', () => {
    expect(getLanguageFromExtension('html')).toBe('html');
  });

  it('returns "css" for "css"', () => {
    expect(getLanguageFromExtension('css')).toBe('css');
  });

  it('returns "python" for "py"', () => {
    expect(getLanguageFromExtension('py')).toBe('python');
  });

  it('returns "java" for "java"', () => {
    expect(getLanguageFromExtension('java')).toBe('java');
  });

  it('returns "ruby" for "rb"', () => {
    expect(getLanguageFromExtension('rb')).toBe('ruby');
  });

  it('returns "cpp" for "cpp"', () => {
    expect(getLanguageFromExtension('cpp')).toBe('cpp');
  });

  it('returns "c" for "c"', () => {
    expect(getLanguageFromExtension('c')).toBe('c');
  });

  it('returns "csharp" for "cs"', () => {
    expect(getLanguageFromExtension('cs')).toBe('csharp');
  });

  it('returns "go" for "go"', () => {
    expect(getLanguageFromExtension('go')).toBe('go');
  });

  it('returns "rust" for "rs"', () => {
    expect(getLanguageFromExtension('rs')).toBe('rust');
  });

  it('returns "php" for "php"', () => {
    expect(getLanguageFromExtension('php')).toBe('php');
  });

  it('returns "swift" for "swift"', () => {
    expect(getLanguageFromExtension('swift')).toBe('swift');
  });

  it('returns "plaintext" for "md"', () => {
    expect(getLanguageFromExtension('md')).toBe('plaintext');
  });

  it('returns "bash" for "sh"', () => {
    expect(getLanguageFromExtension('sh')).toBe('bash');
  });

  it('defaults to "typescript" for an unknown extension', () => {
    expect(getLanguageFromExtension('unknownext')).toBe('typescript');
  });

  it('defaults to "typescript" for an empty string', () => {
    expect(getLanguageFromExtension('')).toBe('typescript');
  });
});