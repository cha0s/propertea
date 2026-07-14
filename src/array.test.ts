import { expect, test, vi } from 'vitest'

import { array } from './array.ts'
import { object } from './object.ts'
import { Pool } from './pool.ts'
import { uint8, uint32 } from  './primitives.js'
import { Diff, Initialize, MarkClean, Set, ToJSON } from './proxy.js'

test('default value', () => {
  const property = array({
    element: uint8(),
  }).default([1, 2, 3])
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  expect(proxy[Diff]()).toEqual({ 0: 1, 1: 2, 2: 3 })
})

test('element default value (primitive)', () => {
  const property = array({
    element: uint8().default(6),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setLength(2)
  expect(proxy[Diff]()).toEqual({ 0: 6, 1: 6 })
})

test('element default value (proxy)', () => {
  const property = array({
    element: object({ x: uint8() }).default({ x: 42 }),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setLength(2)
  expect(proxy[Diff]()).toEqual({ 0: { x: 42 }, 1: { x: 42 } })
})

test('primitive', () => {
  const property = array({
    element: uint8(),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setAt(0, 1)
  expect(proxy.at(0)).toEqual(1)
  expect(proxy[Diff]()).toEqual({ 0: 1 })
})

test('proxy', () => {
  const property = array({
    element: object({ x: uint8() }),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  const value = {x: 4}
  proxy.setAt(0, value)
  const first = proxy.at(0)
  expect(proxy.at(0)).not.toBe(value)
  expect(proxy.at(0)![ToJSON]()).toEqual(value)
  proxy[Set]({ 0: { x: 5 }, 1: { x: 6 } })
  const second = proxy.at(0)
  const third = proxy.at(1)
  expect(first).toBe(second)
  expect(proxy[ToJSON]()).toEqual([{x: 5}, {x: 6}])
  expect(proxy[Diff]()).toEqual({ 0: { x: 5 }, 1: { x: 6 } })
  proxy[Initialize]([{x: 7}])
  const fourth = proxy.at(0)!
  expect(fourth).toBe(first)
  expect(proxy[Diff]()).toEqual({ 0: { x: 7 }, 1: undefined })
  proxy[MarkClean]()
  expect(proxy[Diff]()).toEqual(undefined)
  proxy.setAt(1, {x: 5})
  expect(proxy.at(1)).toBe(third)
  proxy[MarkClean]()
  fourth.x = 54
  expect(proxy[Diff]()).toEqual({ 0: { x: 54 }})
  Proxy.markClean()
  expect(proxy[Diff]()).toEqual(undefined)
})

test('within', () => {
  const property = object({
    x: array({ element: uint8() }),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  const value = [1, 2, 3]
  proxy.x[Initialize](value)
  expect(proxy.x[ToJSON]()).not.toBe(value)
  expect(proxy.x[ToJSON]()).toEqual(value)
  proxy.x[MarkClean]()
  proxy.x.setAt(1, 3)
  expect(proxy[Diff]()).toEqual({ x: { 1: 3 } })
})

test('set diff', () => {
  const property = array({
    element: uint8(),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setAt(0, 1)
  proxy.setAt(1, 2)
  proxy[Set]({ 2: 3 })
  expect(proxy[Diff]()).toEqual({ 0: 1, 1: 2, 2: 3 })
})

test('set with defaults', () => {
  let dirties = 0
  const property = array({
    element: uint8(),
  })
  const Proxy = property.concrete({
    dirty: new Uint8Array(1),
    onDirty: () => { dirties += 1; }
  })
  const proxy = new Proxy(0)
  proxy[Initialize]([1, 2, 3])
  expect(dirties).toEqual(3)
  expect(proxy[Diff]()).toEqual({ 0: 1, 1: 2, 2: 3 })
})

test('set proxy element', () => {
  const property = array({
    element: object({ x: uint8().default(2), y: uint8().default(3) }),
  })
  const Proxy = property.concrete({
    dirty: new Uint8Array(1),
  })
  const proxy = new Proxy(0)
  proxy.setAt(0, { x: 1, y: 2 })
  proxy.setAt(0, JSON.parse(JSON.stringify({ x: 42 })))
  expect(proxy.at(0)!.x).toEqual(42)
  expect(proxy.at(0)!.y).toEqual(2)
})

test('reactivity', () => {
  let dirties = 0
  const property = array({
    element: uint8(),
  })
  const Proxy = property.concrete({
    dirty: new Uint8Array(1),
    onDirty: () => { dirties += 1; }
  })
  const proxy = new Proxy(0)
  expect(dirties).toEqual(0)
  proxy.setAt(0, 1)
  expect(dirties).toEqual(1)
  proxy.setAt(1, 2)
  expect(dirties).toEqual(2)
  proxy[Set]({ 2: 3 })
  expect(proxy[Diff]()).toEqual({ 0: 1, 1: 2, 2: 3 })
})

test('reactivity (proxy)', () => {
  let dirties = 0
  const property = array({
    element: object({ x: uint8() }),
  })
  const Proxy = property.concrete({
    dirty: new Uint8Array(1),
    onDirty: () => { dirties += 1; }
  })
  const proxy = new Proxy(0)
  expect(dirties).toEqual(0)
  proxy.setAt(0, {x: 3})
  expect(dirties).toEqual(1)
  proxy.setAt(1, {x: 4})
  expect(dirties).toEqual(2)
  proxy.at(0)!.x = 5
  expect(dirties).toEqual(3)
  proxy.setAt(1, proxy.at(0)!)
  expect(dirties).toEqual(4)
})

test('remove element', () => {
  const property = array({
    element: uint8(),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setAt(0, 1)
  proxy.setAt(1, 2)
  proxy.setAt(1, undefined)
  expect(proxy[Diff]()).toEqual({ 0: 1, 1: undefined })
})

test('remove element (proxy)', () => {
  const property = array({
    element: object({ x: uint8() }),
  })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  proxy.setAt(0, {x: 1})
  proxy.setAt(1, {x: 2})
  const { $$pool } = proxy as any
  expect($$pool.freeList.length).toEqual(0)
  proxy.setAt(1, undefined)
  expect($$pool.freeList.length).toEqual(1)
  expect(proxy[Diff]()).toEqual({ 0: { x: 1 }, 1: undefined })
  proxy.setAt(1, {x: 3})
  expect($$pool.freeList.length).toEqual(0)
  expect(proxy[Diff]()).toEqual({ 0: { x: 1 }, 1: { x: 3 }})
})

test('decoration', () => {
  const property = array(
    { element: uint8() },
    (O) => class extends O { foo() { return 42 }},
  )
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  expect(proxy.foo()).to.equal(42)
})

test('dirty bits (proxy)', () => {
  const property = object({
    pad: uint32(),
    foo: array({ element: object({ a: uint8(), b: uint8() }) }),
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
  second.foo.setAt(0, { a: 1, b: 2 })
  expect(onDirty).toHaveBeenNthCalledWith(5, 3, second)
  expect(onDirty).toHaveBeenNthCalledWith(6, 3, second)
  second.foo.at(0)!.b = 3
  expect(onDirty).toHaveBeenNthCalledWith(7, 3, second)
  second.foo.setLength(0)
  expect(onDirty).toHaveBeenNthCalledWith(8, 3, second)
  second.foo.setLength(0)
  expect(onDirty).toHaveBeenCalledTimes(8)
  second.foo.setLength(1)
  expect(onDirty).toHaveBeenCalledTimes(10)
})

test('dirty bits (primitive)', () => {
  const property = object({
    pad: uint32(),
    foo: array({ element: uint32() }),
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
  second.foo.setAt(0, 5)
  expect(onDirty).toHaveBeenNthCalledWith(5, 3, second)
  second.foo.setLength(0)
  expect(onDirty).toHaveBeenNthCalledWith(6, 3, second)
  second.foo.setLength(0)
  expect(onDirty).toHaveBeenCalledTimes(6)
  second.foo.setLength(1)
  expect(onDirty).toHaveBeenNthCalledWith(7, 3, second)
  expect(onDirty).toHaveBeenCalledTimes(7)
})

test('dirty reset on allocation', () => {
  const property = object({
    foo: array({ element: object({ a: uint8(), b: uint8() }) }),
  })
  const pool = new Pool(property)
  const first = pool.allocate()
  first.foo.setAt(0, { a: 1, b: 2 })
  pool.free(first)
  const second = pool.allocate()
  expect(second[Diff]()).to.deep.equal(undefined)
})
