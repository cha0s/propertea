import { expect, test } from 'vitest'

import { object } from './object.ts'
import { Diff, MarkClean, ToJSON } from './proxy.ts'
import { Pool } from './pool.ts'
import {
  float32,
  string,
  uint8,
} from './primitives.ts'

test('data', () => {
  const pool = new Pool(object({
    x: object({
      y: object({
        z: uint8().default(123),
        a: uint8().default(234),
      }),
    }),
  }))
  const first = pool.allocate({ x: { y: { z: 43 }}})
  const array = new Uint8Array(pool.data.memory.buffer)
  expect(array[0]).toEqual(43)
  first.x.y.a = 12
  expect(array[1]).toEqual(12)
})

test('dirty (mapped)', () => {
  const pool = new Pool(object({
    o: object({
      x: uint8(),
    }),
    x: uint8(),
  }))
  const proxy = pool.allocate()
  expect(proxy[Diff]()).toEqual({ o: { x: 0 }, x: 0 })
  proxy[MarkClean]()
  pool.free(proxy)
  pool.allocate()
  expect(proxy[Diff]()).toEqual({ o: { x: 0 }, x: 0 })
})

test('dirty (concrete)', () => {
  const pool = new Pool(object({
    o: object({
      x: string(),
    }),
    x: string(),
  }))
  const proxy = pool.allocate()
  expect(proxy[Diff]()).toEqual({ o: { x: ''}, x: ''})
  proxy[MarkClean]()
  pool.free(proxy)
  pool.allocate()
  expect(proxy[Diff]()).toEqual({ o: { x: ''}, x: ''})
})

test('shapeless', () => {
  const pool = new Pool(object({
    x: string(),
  }))
  const first = pool.allocate({ x: 'asd'})
  expect(pool.views.dirty[0]).toEqual(1)
  pool.views.dirty.fill(0)
  first.x = 'asd'
  expect(pool.views.dirty[0]).toEqual(0)
  first.x = 'dfg'
  expect(pool.views.dirty[0]).toEqual(1)
})

test('churn', () => {
  const pool = new Pool(object({
    z: uint8().default(123),
    a: uint8().default(234),
  }))
  const first = pool.allocate()
  first.z = 23
  pool.free(first)
  expect(pool.allocate({ a: 54 })).toBe(first)
  expect(new Uint8Array(pool.data.memory.buffer)[1]).toEqual(54)
  expect(first.z).toEqual(123)
})

test('clean', () => {
  const pool = new Pool(object({
    z: uint8().default(123),
    a: uint8().default(234),
  }))
  const first = pool.allocate()
  pool.views.dirty.fill(0)
  first.z = 12
  pool.markClean()
  expect(pool.views.dirty[0]).toEqual(0)
})

test('allocation augmentation', () => {
  const pool = new Pool(object({
    z: uint8().default(123),
    a: uint8().default(234),
  }, (O) => class extends O { bar() { return 'bar' }}))
  const first = pool.allocate<{ foo: number }>({}, (proxy) => { proxy.foo = 12; })
  expect(first.foo).toEqual(12)
  expect(first.bar()).toEqual('bar')
})

interface WasmTestExports extends Record<string, any> {
  thisIsAWasmTest: (arg: number) => void
}

test('wasm', async () => {
  const pool = new Pool(object({
    z: float32(),
  }), { useWasm: true })
  const samples = []
  for (let i = 0; i < 10; ++i) {
    const sample = Math.random()
    samples.push(sample)
    pool.allocate({ z: sample })
  }
  pool.markClean()
  const { default: buffer } = await import('./pool.test.wat?multi_memory')
  const exports = await WebAssembly.instantiate(buffer, { pool: pool.wasmImports()})
    .then(({ instance: { exports }}) => exports as WasmTestExports)
  const parameter = Math.random()
  exports.thisIsAWasmTest(parameter)
  for (let i = 0; i < 10; ++i) {
    expect(pool.proxies[i]!.z).toBeCloseTo(parameter + i + samples[i])
  }
  expect(pool.proxies.map((proxy) => proxy![Diff]())).toEqual(
    pool.proxies.map((proxy) => proxy![ToJSON]())
  )
})

test('allocation reactivity', () => {
  let dirties = 0
  const pool = new Pool(object({
    o: object({
      x: uint8(),
    }),
    x: uint8(),
  }), {
    onDirty: () => { dirties += 1; },
  })
  const proxy = pool.allocate()
  expect(dirties).toEqual(2)
  pool.free(proxy)
  pool.allocate()
  expect(dirties).toEqual(4)
})
