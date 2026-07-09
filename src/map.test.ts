import { expect, test, vi } from 'vitest'

import { array } from './array.ts'
import { map } from './map.ts'
import { object } from './object.ts'
import { Pool } from './pool.ts'
import { uint8, uint32 } from './primitives.ts'
import { Diff, MarkClean, Set, ToJSON } from './proxy.js'

test('primitive', () => {
  const property = map({
    key: uint8(),
    value: uint8(),
  })
  const Map = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Map(0)
  proxy.set(0, 3)
  expect(proxy.get(0)).toEqual(3)
})

test('proxy', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  })
  const Map = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Map(0)
  const value = {x: 3}
  proxy.set(0, value)
  expect(proxy.get(0)).not.toBe(value)
  expect(proxy.get(0)![ToJSON]()).toEqual(value)
})

test('ToJSON', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  })
  const Map = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Map(0)
  const value = {x: 3}
  proxy.set(0, value)
  expect(proxy[ToJSON]()).toEqual([[0, {x: 3}]])
})

test('nested', () => {
  const property = map({
    key: uint8(),
    value: map({
      key: uint8(),
      value: object({ x: uint8() }),
    }),
  })
  const Map = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Map(0)
  proxy.set(0, [[0, {x: 3}]] as any)
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 3}]]]])
  proxy.get(0)!.get(0)!.x = 1
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 1}]]]])
  const Map2 = map({
    key: uint8(),
    value: object({ x: uint8() }),
  }).concrete({ dirty: new Uint8Array(1) })
  const proxy2 = new Map2(0)
  proxy2.set(0, {x: 5})
  proxy.set(0, proxy2)
  expect(proxy[ToJSON]()).toEqual([[0, [[0, {x: 5}]]]])
})

test('dirty', () => {
  const property = map({
    key: uint8(),
    value: object({ x: uint8() }),
  })
  const Map = property.concrete({
    dirty: new Uint8Array(1),
  })
  const proxy = new Map(0)
  const value = {x: 3}
  proxy.set(0, value)
  expect(proxy[Diff]()).toEqual([[0, {x: 3}]])
  proxy.delete(0)
  expect(proxy[Diff]()).toEqual([[0, undefined]])
  proxy.set(1, value)
  proxy.set(2, value)
  proxy[MarkClean]()
  proxy.clear()
  expect(proxy[Diff]()).toEqual([[1, undefined], [2, undefined]])
  proxy[MarkClean]()
  expect(proxy[Diff]()).toEqual(undefined)
})

test('dirty nested', () => {
  const property = map({
    key: uint8(),
    value: map({
      key: uint8(),
      value: object({ x: uint8() }),
    }),
  })
  const dirty = new Uint8Array(1)
  const onDirty = vi.fn()
  const Map = property.concrete({ dirty, onDirty })
  const proxy = new Map(0, 0)
  const value = {x: 3}
  proxy.set(0, [[0, value]] as any)
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 3}]]]])
  proxy[MarkClean]()
  proxy.get(0)!.get(0)!.x = 2
  expect(proxy[Diff]()).toEqual([[0, [[0, {x: 2}]]]])
})

test('dirty bits (proxy)', () => {
  const property = object({
    pad: uint32(),
    foo: map({ key: uint32(), value: object({ a: uint8(), b: uint8() }) }),
  })
  const onDirty = vi.fn()
  const pool = new Pool(property, {
    onDirty,
  })
  const first = pool.allocate()
  expect(onDirty).toHaveBeenNthCalledWith(1, 0, undefined)
  expect(onDirty).toHaveBeenNthCalledWith(2, 1, first)
  const second = pool.allocate()
  expect(onDirty).toHaveBeenNthCalledWith(3, 2, undefined)
  expect(onDirty).toHaveBeenNthCalledWith(4, 3, second)
  pool.free(first)
  second.foo.set(0, { a: 1, b: 2 })
  expect(onDirty).toHaveBeenNthCalledWith(5, 3, second)
  expect(onDirty).toHaveBeenNthCalledWith(6, 3, second)
  second.foo.get(0)!.b = 3
  expect(onDirty).toHaveBeenNthCalledWith(7, 3, second)
  second.foo.clear()
  expect(onDirty).toHaveBeenNthCalledWith(8, 3, second)
  second.foo.clear()
  expect(onDirty).toHaveBeenCalledTimes(8)
})

test('dirty bits (primitive)', () => {
  const property = object({
    pad: uint32(),
    foo: map({ key: uint32(), value: uint32() }),
  })
  const onDirty = vi.fn()
  const pool = new Pool(property, {
    onDirty,
  })
  const first = pool.allocate()
  expect(onDirty).toHaveBeenNthCalledWith(1, 0, undefined)
  expect(onDirty).toHaveBeenNthCalledWith(2, 1, first)
  const second = pool.allocate()
  expect(onDirty).toHaveBeenNthCalledWith(3, 2, undefined)
  expect(onDirty).toHaveBeenNthCalledWith(4, 3, second)
  pool.free(first)
  second.foo.set(0, 5)
  expect(onDirty).toHaveBeenNthCalledWith(5, 3, second)
  second.foo.clear()
  expect(onDirty).toHaveBeenNthCalledWith(6, 3, second)
  second.foo.clear()
  expect(onDirty).toHaveBeenCalledTimes(6)
})

test('nested decoration', () => {
  object({
    s: map({
      key: uint8(),
      value: object({
        t: uint8(),
      }, (O) => {
        return class extends O {
          foo() { return this.t }
        }
      })
    })
  }, (O) => {
    return class extends O {
      bar() {
        const item = this.s.get(0)
        return item?.foo()
      }
    }
  })
})

test('nested cleaning', () => {
  const property = map({
    key: uint8(),
    value: object({
      x: array({
        element: object({
          y: array({
            element: uint8(),
          })
        })
      }),
    }),
  })
  const pool = new Pool(property)
  const first = pool.allocate()
  first[Set]([[0, { x: [ { y: [1, 2]} ]}]] as any)
  pool.markClean()
  expect(first.get(0)!.x.at(0)!.y[Diff]()).to.equal(undefined)
})
