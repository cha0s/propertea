import {expect, test} from 'vitest';

import './map.js';
import './object.js';
import './primitives.js';
import {Diff, MarkClean, ToJSON} from './proxy.js';
import {registry} from './register.js';

test('primitive', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {type: 'uint8'},
  });
  const Map = property.concrete();
  const proxy = new Map();
  proxy.set(0, 3);
  expect(proxy.get(0)).toEqual(3);
});

test('proxy', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {type: 'object', properties: {x: {type: 'uint8'}}},
  });
  const Map = property.concrete();
  const proxy = new Map();
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy.get(0)).not.toBe(value);
  expect(proxy.get(0)[ToJSON]()).toEqual(value);
});

test('ToJSON', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {type: 'object', properties: {x: {type: 'uint8'}}},
  });
  const Map = property.concrete();
  const proxy = new Map();
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy[ToJSON]()).toEqual([[0, {x: 3}]]);
});

test('nested', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {
      type: 'map',
      key: {type: 'uint8'},
      value: {type: 'object', properties: {x: {type: 'uint8'}}},
    },
  });
  const Map = property.concrete();
  const proxy = new Map();
  proxy.set(0, [[0, {x: 3}]]);
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 3}]]]]);
  proxy.get(0).get(0).x = 1;
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 1}]]]]);
});

test('dirty', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {type: 'object', properties: {x: {type: 'uint8'}}},
  });
  const Map = property.concrete({dirty: true});
  const proxy = new Map();
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy[Diff]()).toEqual([[0, {x: 3}]]);
  proxy.delete(0);
  expect(proxy[Diff]()).toEqual([[0, undefined]]);
  proxy.set(1, value);
  proxy.set(2, value);
  proxy[MarkClean]();
  proxy.clear();
  expect(proxy[Diff]()).toEqual([[1, undefined], [2, undefined]]);
  proxy[MarkClean]();
  expect(proxy[Diff]()).toEqual([]);
});

test('dirty nested', () => {
  const property = new registry.map({
    key: {type: 'uint8'},
    value: {
      type: 'map',
      key: {type: 'uint8'},
      value: {type: 'object', properties: {x: {type: 'uint8'}}},
    },
  });
  const dirty = new Uint8Array(1);
  const Map = property.concrete({dirty});
  const proxy = new Map();
  const value = {x: 3};
  proxy.set(0, [[0, value]]);
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 3}]]]]);
  proxy[MarkClean]();
  proxy.get(0).get(0).x = 2;
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 2}]]]]);
});
