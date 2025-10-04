import { expect, test } from 'vitest';

import './array.js';
import './object.js';
import './primitives.js';
import { Diff, MarkClean, Set, SetWithDefaults, ToJSON } from './proxy.js';
import { registry } from './register.js';

test('default value', () => {
  const property = new registry.array({
    defaultValue: [1, 2, 3],
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('primitive', () => {
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  proxy.setAt(0, 1);
  expect(proxy[0]).toEqual(1);
  expect(proxy[Diff]()).toEqual({0: 1});
});

test('proxy', () => {
  const property = new registry.array({
    element: {type: 'object', properties: {x: {type: 'uint8'}}},
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  const value = {x: 4};
  proxy.setAt(0, value);
  const first = proxy[0];
  expect(proxy[0]).not.toBe(value);
  expect(proxy[0][ToJSON]()).toEqual(value);
  proxy[Set]([{x: 5}, {x: 6}]);
  const second = proxy[0];
  const third = proxy[1];
  expect(first).toBe(second);
  expect(proxy[ToJSON]()).toEqual([{x: 5}, {x: 6}]);
  expect(proxy[Diff]()).toEqual({0: {x: 5}, 1: {x: 6}});
  proxy[Set]([{x: 7}]);
  const fourth = proxy[0];
  expect(fourth).toBe(first);
  expect(proxy[Diff]()).toEqual({0: {x: 7}, 1: undefined});
  proxy[MarkClean]();
  expect(proxy[Diff]()).toEqual({});
  proxy.setAt(1, {x: 5});
  expect(proxy[1]).toBe(third);
});

test('within', () => {
  const property = new registry.object({
    properties: {
      x: {type: 'array', element: {type: 'uint8'}},
    },
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  const value = [1, 2, 3];
  proxy.x = value;
  expect(proxy.x[ToJSON]()).not.toBe(value);
  expect(proxy.x[ToJSON]()).toEqual(value);
  proxy.x[MarkClean]();
  proxy.x.setAt(1, 3);
  expect(proxy[Diff]()).toEqual({x: {1: 3}});
});

test('set partial', () => {
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  proxy.setAt(0, 1);
  proxy.setAt(1, 2);
  proxy[Set]({2: 3});
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('set with defaults', () => {
  let dirties = 0;
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy();
  proxy[SetWithDefaults]([1, 2, 3]);
  expect(dirties).toEqual(3);
  expect(proxy[Diff]()).toEqual({0: 1, 1: 2, 2: 3});
});

test('reactivity', () => {
  let dirties = 0;
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy();
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
  const property = new registry.array({
    element: {
      type: 'object',
      properties: {
        x: {type: 'uint8'},
      },
    },
  });
  const Proxy = property.concrete({
    onDirty: () => { dirties += 1; }
  });
  const proxy = new Proxy();
  expect(dirties).toEqual(0);
  proxy.setAt(0, {x: 3});
  expect(dirties).toEqual(1);
  proxy.setAt(1, {x: 4});
  expect(dirties).toEqual(2);
  proxy[0].x = 5;
  expect(dirties).toEqual(3);
  proxy.setAt(1, proxy[0]);
  expect(dirties).toEqual(4);
});

test('disabled diff (proxy)', () => {
  const property = new registry.array({
    element: {
      type: 'object',
      properties: {
        x: {type: 'uint8'},
      },
    },
  });
  const Proxy = property.concrete({onDirty: false});
  const proxy = new Proxy();
  proxy.setAt(0, {x: 1});
  expect(proxy.dirty.size).toEqual(0);
  expect(proxy[Diff]).toBeUndefined();
});

test('remove element', () => {
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
  proxy.setAt(0, 1);
  proxy.setAt(1, 2);
  proxy.setAt(1, undefined);
  expect(proxy[Diff]()).toEqual({0: 1, 1: undefined});
});

test('remove element (proxy)', () => {
  const property = new registry.array({
    element: {
      type: 'object',
      properties: {
        x: {type: 'uint8'},
      },
    },
  });
  const Proxy = property.concrete();
  const proxy = new Proxy();
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
