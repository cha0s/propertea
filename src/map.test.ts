import { expect, test } from 'vitest';

import { map } from './map.ts';
import { object } from './object.ts';
import { uint8 } from './primitives.ts';
import { Diff, MarkClean, ToJSON } from './proxy.js';

test('primitive', () => {
  const property = map({
    key: uint8(),
    value: uint8(),
  });
  const Map = property.concrete();
  const proxy = new Map(0);
  proxy.set(0, 3);
  expect(proxy.get(0)).toEqual(3);
});

test('proxy', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  });
  const Map = property.concrete();
  const proxy = new Map(0);
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy.get(0)).not.toBe(value);
  expect(proxy.get(0)![ToJSON]()).toEqual(value);
});

test('ToJSON', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  });
  const Map = property.concrete();
  const proxy = new Map(0);
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy[ToJSON]()).toEqual([[0, {x: 3}]]);
});

test('nested', () => {
  const property = map({
    key: uint8(),
    value: map({
      key: uint8(),
      value: object({ x: uint8() }),
    }),
  });
  const Map = property.concrete();
  const proxy = new Map(0);
  proxy.set(0, [[0, {x: 3}]] as any);
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 3}]]]]);
  proxy.get(0)!.get(0)!.x = 1;
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 1}]]]]);
  const Map2 = map({
    key: uint8(),
    value: object({ x: uint8() }),
  }).concrete();
  const proxy2 = new Map2(0);
  proxy2.set(0, {x: 5});
  proxy.set(0, proxy2);
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 5}]]]]);
});

test('dirty', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  });
  const Map = property.concrete({onDirty: true});
  const proxy = new Map(0);
  const value = {x: 3};
  proxy.set(0, value);
  expect(proxy[Diff]()).toEqual([[0, {x: 3}]]);
  proxy.delete(0);
  expect(proxy[Diff]()).toEqual([[0, null]]);
  proxy.set(1, value);
  proxy.set(2, value);
  proxy[MarkClean]();
  proxy.clear();
  expect(proxy[Diff]()).toEqual([[1, null], [2, null]]);
  proxy[MarkClean]();
  expect(proxy[Diff]()).toEqual([]);
});

test('dirty nested', () => {
  const property = map({
    key: uint8(),
    value: map({
      key: uint8(),
      value: object({ x: uint8() }),
    }),
  });
  const dirty = new Uint8Array(1);
  const Map = property.concrete({dirty});
  const proxy = new Map(0);
  const value = {x: 3};
  proxy.set(0, [[0, value]] as any);
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 3}]]]]);
  proxy[MarkClean]();
  proxy.get(0)!.get(0)!.x = 2;
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 2}]]]]);
});
