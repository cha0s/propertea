import {expect, test} from 'vitest';

import './array.js';
import './object.js';
import './primitives.js';
import {Diff, MarkClean, Set, ToJSON} from './proxy.js';
import {registry} from './register.js';

test('primitive', () => {
  const property = new registry.array({
    element: {type: 'uint8'},
  });
  const Map = property.concrete();
  const proxy = new Map();
  proxy.setAt(0, 1);
  expect(proxy[0]).toEqual(1);
  expect(proxy[Diff]()).toEqual({0: 1});
});

test('proxy', () => {
  const property = new registry.array({
    element: {type: 'object', properties: {x: {type: 'uint8'}}},
  });
  const Map = property.concrete();
  const proxy = new Map();
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
  const Map = property.concrete();
  const proxy = new Map();
  const value = [1, 2, 3];
  proxy.x = value;
  expect(proxy.x[ToJSON]()).not.toBe(value);
  expect(proxy.x[ToJSON]()).toEqual(value);
  proxy.x[MarkClean]();
  proxy.x.setAt(1, 3);
  expect(proxy[Diff]()).toEqual({x: {1: 3}});
});
