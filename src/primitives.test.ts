import { expect, test } from 'vitest';

import { object } from './object.ts'
import {
  boolean,
  float32,
  float64,
  int8,
  int16,
  int32,
  int64,
  string,
  uint8,
  uint16,
  uint32,
  uint64,
  varint,
  varuint,
} from './primitives.ts'

test('boolean', () => {
  expect(boolean().defaultValue).toEqual(false)
  expect(boolean().default(true).defaultValue).toEqual(true)
})

;[
  float32,
  float64,
  int8,
  int16,
  int32,
  uint8,
  uint16,
  uint32,
].forEach((propertea) => {
  test(propertea.name, () => {
    expect(propertea().defaultValue).toEqual(0)
    expect(propertea().default(2).defaultValue).toEqual(2)
  })
  test(`mapped ${propertea.name}`, () => {
    const { elementClass } = propertea().codec
    const property = object({
      x: propertea(),
      y: propertea(),
    });
    const data = new elementClass(2);
    const Proxy = property.mapped({
      data: new DataView(data.buffer),
      dirty: new Uint8Array(1),
    });
    const proxy = new Proxy(0);
    proxy.x = 1;
    proxy.y = 2;
    expect(data).toEqual(new elementClass([proxy.x, proxy.y]));
  })
})

;[
  int64,
  uint64,
].forEach((propertea) => {
  test(propertea.name, () => {
    expect(propertea().defaultValue).toEqual(0n);
    expect(propertea().default(2n).defaultValue).toEqual(2n);
  })
  test(`mapped ${propertea.name}`, () => {
    const { elementClass } = propertea().codec
    const property = object({
      x: propertea(),
      y: propertea(),
    });
    const data = new elementClass(2);
    const Proxy = property.mapped({
      data: new DataView(data.buffer),
      dirty: new Uint8Array(1),
    });
    const proxy = new Proxy(0);
    proxy.x = 1n;
    proxy.y = 2n;
    expect(data).toEqual(new elementClass([proxy.x, proxy.y]));
  })
});

test('string', () => {
  expect(string().defaultValue).toEqual('');
  expect(string().default('foobar').defaultValue).toEqual('foobar');
})

;[
  varint,
  varuint,
].forEach((propertea) => {
  test(propertea.name, () => {
    expect(propertea().defaultValue).toEqual(0)
    expect(propertea().default(2).defaultValue).toEqual(2)
  })
})
