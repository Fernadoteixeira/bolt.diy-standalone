import { describe, expect, it } from 'vitest';
import { classNames } from './classNames';

describe('classNames', () => {
  it('returns an empty string when called with no arguments', () => {
    expect(classNames()).toBe('');
  });

  it('joins multiple string arguments with a space', () => {
    expect(classNames('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('converts a number argument to a string', () => {
    expect(classNames('item', 42)).toBe('item 42');
  });

  it('includes an object key when its value is truthy', () => {
    expect(classNames({ active: true, hidden: false })).toBe('active');
  });

  it('includes multiple truthy object keys in insertion order', () => {
    expect(classNames({ a: true, b: true, c: false })).toBe('a b');
  });

  it('flattens nested arrays of class values', () => {
    expect(classNames(['a', 'b'], 'c')).toBe('a b c');
  });

  it('flattens deeply nested arrays', () => {
    expect(classNames(['a', ['b', ['c']]])).toBe('a b c');
  });

  it('skips null and undefined arguments', () => {
    expect(classNames(null, undefined, 'foo', null)).toBe('foo');
  });

  it('skips boolean false arguments', () => {
    expect(classNames(false, 'foo')).toBe('foo');
  });

  it('handles a mix of strings, objects, arrays, and nullish values', () => {
    expect(classNames('btn', { large: true, small: false }, ['icon', 'red'], null, 0)).toBe('btn large icon red 0');
  });

  it('returns an empty string when all arguments are falsy or nullish', () => {
    expect(classNames(null, undefined, false, { a: false })).toBe('');
  });

  it('treats zero as a numeric class name', () => {
    expect(classNames(0)).toBe('0');
  });

  it('does not add a leading space when the first argument is an empty string', () => {
    expect(classNames('', 'foo')).toBe('foo');
  });
});