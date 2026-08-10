import { describe, expect, it } from 'vitest';
import { isAllowedUrl, isValidUrl } from './url';

describe('isValidUrl', () => {
  it('returns true for an http URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('returns true for an https URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('returns true for an http URL with a port', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('returns true for an https URL with a path', () => {
    expect(isValidUrl('https://example.com/path/to/resource')).toBe(true);
  });

  it('returns true for an https URL with a query string', () => {
    expect(isValidUrl('https://example.com/search?q=test')).toBe(true);
  });

  it('returns false for a non-URL string', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('returns false for a javascript: protocol URL', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('returns false for a file: protocol URL', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('returns false for an ftp: protocol URL', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('returns false for a data: protocol URL', () => {
    expect(isValidUrl('data:text/plain,hello')).toBe(false);
  });

  it('returns false for a string with spaces', () => {
    expect(isValidUrl('https://exa mple.com')).toBe(false);
  });

  it('returns false for a bare hostname without protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });
});

describe('isAllowedUrl', () => {
  it('returns true for a public https URL', () => {
    expect(isAllowedUrl('https://github.com/user/repo')).toBe(true);
  });

  it('returns true for a public http URL', () => {
    expect(isAllowedUrl('http://example.com')).toBe(true);
  });

  it('returns false for an invalid URL', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false);
  });

  it('returns false for localhost', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(false);
  });

  it('returns false for 127.0.0.1 (loopback)', () => {
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(false);
  });

  it('returns false for 127.0.0.1 without a port', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
  });

  it('returns false for 10.x.x.x (Class A private)', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false);
  });

  it('returns false for 172.16.x.x (Class B private)', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
  });

  it('returns false for 172.31.x.x (upper Class B private bound)', () => {
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false);
  });

  it('returns true for 172.32.x.x (just above Class B private range)', () => {
    expect(isAllowedUrl('http://172.32.0.1')).toBe(true);
  });

  it('returns false for 192.168.x.x (Class C private)', () => {
    expect(isAllowedUrl('http://192.168.1.1')).toBe(false);
  });

  it('returns false for 169.254.x.x (link-local)', () => {
    expect(isAllowedUrl('http://169.254.1.1')).toBe(false);
  });

  it('returns false for 0.0.0.0 (unspecified)', () => {
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false);
  });

  it('returns false for [::1] (IPv6 loopback)', () => {
    expect(isAllowedUrl('http://[::1]')).toBe(false);
  });

  it('returns true for a public IP address', () => {
    expect(isAllowedUrl('http://93.184.216.34')).toBe(true);
  });

  it('returns true for a public domain with uppercase hostname', () => {
    expect(isAllowedUrl('https://EXAMPLE.COM/path')).toBe(true);
  });

  it('returns false for a javascript: URL', () => {
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });
});