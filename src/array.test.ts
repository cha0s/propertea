import { expect, test } from 'vitest';

import { array } from './array.ts';
import { object } from './object.ts';
import { uint8 } from  './primitives.js';
import { Diff, MarkClean, Set, SetWithDefaults, ToJSON } from './proxy.js';

test('default value', () => {
  const property = array({
    element: uint8(),
  }).default([1, 2, 3]);
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('primitive', () => {
  const property = array({
    element: uint8(),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.setAt(0, 1);
  expect(proxy.at(0)).toEqual(1);
  expect(proxy[Diff]()).toEqual({0: 1});
});

test('proxy', () => {
  const property = array({
    element: object({ x: uint8() }),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  const value = {x: 4};
  proxy.setAt(0, value);
  const first = proxy.at(0);
  expect(proxy.at(0)).not.toBe(value);
  expect(proxy.at(0)![ToJSON]()).toEqual(value);
  proxy[Set]([{x: 5}, {x: 6}]);
  const second = proxy.at(0);
  const third = proxy.at(1);
  expect(first).toBe(second);
  expect(proxy[ToJSON]()).toEqual([{x: 5}, {x: 6}]);
  expect(proxy[Diff]()).toEqual({0: {x: 5}, 1: {x: 6}});
  proxy[Set]([{x: 7}]);
  const fourth = proxy.at(0);
  expect(fourth).toBe(first);
  expect(proxy[Diff]()).toEqual({0: {x: 7}, 1: undefined});
  proxy[MarkClean]();
  expect(proxy[Diff]()).toEqual({});
  proxy.setAt(1, {x: 5});
  expect(proxy.at(1)).toBe(third);
});

test('within', () => {
  const property = object({
    x: array({ element: uint8() }),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  const value = [1, 2, 3];
  proxy.x[Set](value);
  expect(proxy.x[ToJSON]()).not.toBe(value);
  expect(proxy.x[ToJSON]()).toEqual(value);
  proxy.x[MarkClean]();
  proxy.x.setAt(1, 3);
  expect(proxy[Diff]()).toEqual({x: {1: 3}});
});

test('set diff', () => {
  const property = array({
    element: uint8(),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.setAt(0, 1);
  proxy.setAt(1, 2);
  proxy[Set]({2: 3});
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('set with defaults', () => {
  let dirties = 0;
  const property = array({
    element: uint8(),
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy(0);
  proxy[SetWithDefaults]([1, 2, 3]);
  expect(dirties).toEqual(3);
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('reactivity', () => {
  let dirties = 0;
  const property = array({
    element: uint8(),
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy(0);
  expect(dirties).toEqual(0);
  proxy.setAt(0, 1);
  expect(dirties).toEqual(1);
  proxy.setAt(1, 2);
  expect(dirties).toEqual(2);
  proxy[Set]({2: 3});
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('reactivity (proxy)', () => {
  let dirties = 0;
  const property = array({
    element: object({ x: uint8() }),
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy(0);
  expect(dirties).toEqual(0);
  proxy.setAt(0, {x: 3});
  expect(dirties).toEqual(1);
  proxy.setAt(1, {x: 4});
  expect(dirties).toEqual(2);
  proxy.at(0)!.x = 5;
  expect(dirties).toEqual(3);
  proxy.setAt(1, proxy.at(0)!);
  expect(dirties).toEqual(4);
});

test('disabled dirty tracking (proxy)', () => {
  const property = array({
    element: object({ x: uint8() }),
  });
  const Proxy = property.concrete({onDirty: false});
  const proxy = new Proxy(0);
  proxy.setAt(0, {x: 1});
  expect('dirty' in proxy).toEqual(false);
  expect(Diff in proxy).to.equal(false);
});

test('remove element', () => {
  const property = array({
    element: uint8(),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.setAt(0, 1);
  proxy.setAt(1, 2);
  proxy.setAt(1, undefined);
  expect(proxy[Diff]()).toEqual({0: 1, 1: undefined});
});

test('remove element (proxy)', () => {
  const property = array({
    element: object({ x: uint8() }),
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.setAt(0, {x: 1});
  proxy.setAt(1, {x: 2});
  expect(proxy.pool.freeList.length).toEqual(0);
  proxy.setAt(1, undefined);
  expect(proxy.pool.freeList.length).toEqual(1);
  expect(proxy[Diff]()).toEqual({0: {x: 1}, 1: undefined});
  proxy.setAt(1, {x: 3});
  expect(proxy.pool.freeList.length).toEqual(0);
  expect(proxy[Diff]()).toEqual({0: {x: 1}, 1: {x: 3}});
});

test('decoration', () => {
  const property = array(
    { element: uint8() },
    (O) => class extends O { foo() { return 42 }},
  );
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  expect(proxy.foo()).to.equal(42)
});
