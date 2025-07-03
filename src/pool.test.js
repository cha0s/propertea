import {expect, test} from 'vitest';

import './object.js';
import './primitives.js';
import {Diff, ToJSON} from './proxy.js';
import {Pool} from './pool.js';

test('data', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      x: {
        type: 'object',
        properties: {
          y: {
            type: 'object',
            properties: {
              z: {
                defaultValue: 123,
                type: 'uint8',
              },
              a: {
                defaultValue: 234,
                type: 'uint8',
              },
            },
          },
        },
      },
    },
  });
  const first = pool.allocate({x: {y: {z: 43}}});
  const array = new Uint8Array(pool.data.memory.buffer);
  expect(array[0]).toEqual(43);
  first.x.y.a = 12;
  expect(array[1]).toEqual(12);
});

test('shapeless', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      x: {
        type: 'string',
      },
    },
  });
  const first = pool.allocate({x: 'asd'});
  expect(pool.views.dirty[0]).toEqual(1);
  pool.views.dirty.fill(0);
  first.x = 'asd';
  expect(pool.views.dirty[0]).toEqual(0);
  first.x = 'dfg';
  expect(pool.views.dirty[0]).toEqual(1);
});

test('churn', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      z: {
        defaultValue: 123,
        type: 'uint8',
      },
      a: {
        defaultValue: 234,
        type: 'uint8',
      },
    },
  });
  const first = pool.allocate();
  first.z = 23;
  pool.free(first);
  expect(pool.allocate({a: 54})).toBe(first);
  expect(new Uint8Array(pool.data.memory.buffer)[1]).toEqual(54);
  expect(first.z).toEqual(123);
});

test('clean', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      z: {
        defaultValue: 123,
        type: 'uint8',
      },
      a: {
        defaultValue: 234,
        type: 'uint8',
      },
    },
  });
  const first = pool.allocate();
  pool.views.dirty.fill(0);
  first.z = 12;
  pool.markClean();
  expect(pool.views.dirty[0]).toEqual(0);
});

test('no dirty tracking', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      z: {
        defaultValue: 123,
        type: 'uint8',
      },
      a: {
        defaultValue: 234,
        type: 'uint8',
      },
    },
  }, {onDirty: false});
  const first = pool.allocate();
  expect(pool.views.dirty).toEqual(null);
  expect(() => { first.z = 12; }).not.toThrowError();
});

test('allocate initialize', () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      z: {
        defaultValue: 123,
        type: 'uint8',
      },
      a: {
        defaultValue: 234,
        type: 'uint8',
      },
    },
  });
  const first = pool.allocate({}, (proxy) => { proxy.foo = 12; });
  expect(first.foo).toEqual(12);
});

test('wasm', async () => {
  const pool = new Pool({
    type: 'object',
    properties: {
      z: {
        type: 'float32',
      },
    },
  });
  const samples = [];
  for (let i = 0; i < 10; ++i) {
    const sample = Math.random();
    samples.push(sample);
    pool.allocate({z: sample});
  }
  const {default: buffer} = await import('./pool.test.wat?multi_memory');
  const exports = await WebAssembly.instantiate(buffer, {pool: pool.imports()})
    .then(({instance: {exports}}) => exports);
  const parameter = Math.random();
  pool.markClean();
  exports.test(parameter);
  for (let i = 0; i < 10; ++i) {
    expect(pool.proxies[i].z).toBeCloseTo(parameter + i + samples[i]);
  }
  expect(pool.proxies.values((proxy) => proxy[Diff]())).toEqual(
    pool.proxies.values((proxy) => proxy[ToJSON]())
  );
});
