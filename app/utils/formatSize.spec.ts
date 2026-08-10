import { describe, expect, it } from 'vitest';
import { formatSize } from './formatSize';

describe('formatSize', () => {
  it('formats zero bytes', () => {
    expect(formatSize(0)).toBe('0.0 B');
  });

  it('formats bytes below 1024 as B', () => {
    expect(formatSize(512)).toBe('512.0 B');
  });

  it('formats exactly 1024 bytes as KB', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formats terabytes', () => {
    expect(formatSize(1024 ** 4)).toBe('1.0 TB');
  });

  it('caps at terabytes for petabyte-scale values', () => {
    // 1 PB should still display in TB because TB is the largest unit
    expect(formatSize(1024 ** 5)).toBe('1024.0 TB');
  });

  it('rounds to one decimal place', () => {
    expect(formatSize(1100)).toBe('1.1 KB');
  });

  it('handles fractional kilobytes', () => {
    expect(formatSize(2048 + 512)).toBe('2.5 KB');
  });

  it('handles very small values', () => {
    expect(formatSize(1)).toBe('1.0 B');
  });

  it('handles large round numbers in KB', () => {
    expect(formatSize(512 * 1024)).toBe('512.0 KB');
  });
});