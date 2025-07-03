import {expect, test} from 'vitest';

import './object.js';
import './primitives.js';
import {registry} from './register.js';

test('bool', () => {
  expect(new registry.bool().defaultValue).toEqual(false);
  expect(new registry.bool({defaultValue: true}).defaultValue).toEqual(true);
});

test('number', () => {
  [
    'float32',
    'float64',
    'int8',
    'int16',
    'int32',
    'uint8',
    'uint16',
    'uint32',
    'varint',
    'varuint',
  ].forEach((type) => {
    expect(new registry[type]().defaultValue).toEqual(0);
    expect(new registry[type]({defaultValue: 2}).defaultValue).toEqual(2);
  })
});

function typeToElementClass(type) {
  switch (type) {
    case 'int8': return Int8Array;
    case 'uint8': return Uint8Array;
    case 'int16': return Int16Array;
    case 'uint16': return Uint16Array;
    case 'int32': return Int32Array;
    case 'uint32': return Uint32Array;
    case 'float32': return Float32Array;
    case 'float64': return Float64Array;
    case 'int64': return BigInt64Array;
    case 'uint64': return BigUint64Array;
  }
  return undefined;
}

test('data', () => {
  [
    'float32',
    'float64',
    'int8',
    'uint8',
    'int16',
    'uint16',
    'int32',
    'uint32',
  ].forEach((type) => {
    expect(new registry[type]().defaultValue).toEqual(0);
    expect(new registry[type]({defaultValue: 2}).defaultValue).toEqual(2);
    const ElementClass = typeToElementClass(type);
    const property = new registry.object({
      type: 'object',
      properties: {
        x: {type},
        y: {type},
      },
    });
    const data = new ElementClass(2);
    const Proxy = property.map({data: new DataView(data.buffer)});
    const proxy = new Proxy(0);
    proxy.x = 1;
    proxy.y = 2;
    expect(data).toEqual(new ElementClass([proxy.x, proxy.y]));
  });
});

test('64-bit codec', () => {
  [
    'int64',
    'uint64',
  ].forEach((type) => {
    expect(new registry[type]().defaultValue).toEqual(0n);
    expect(new registry[type]({defaultValue: 2n}).defaultValue).toEqual(2n);
    const ElementClass = typeToElementClass(type);
    const property = new registry.object({
      type: 'object',
      properties: {
        x: {type},
        y: {type},
      },
    });
    const data = new ElementClass(2);
    const Proxy = property.map({data: new DataView(data.buffer)});
    const proxy = new Proxy(0);
    proxy.x = 1n;
    proxy.y = 2n;
    expect(data).toEqual(new ElementClass([proxy.x, proxy.y]));
  });
});

test('string', () => {
  expect(new registry.string().defaultValue).toEqual('');
  expect(new registry.string({defaultValue: 'foobar'}).defaultValue).toEqual('foobar');
});
