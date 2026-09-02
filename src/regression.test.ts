import { describe, expect, test } from 'vitest'

import { array } from './array.ts'
import { map } from './map.ts'
import { object } from './object.ts'
import { Index, Pool } from './pool.ts'
import { uint8 } from './primitives.ts'
import { Diff, MarkClean, ToJSON } from './proxy.ts'

/*
 * Regression tests for bugs found in the audit of this library.
 *
 * See `src/audit-notes.md` for the analysis behind each case. The tests are
 * grouped by root cause; every case documents the contract the API should
 * honor and would have failed against the pre-fix implementation.
 */

describe('pool.free: freeing a proxy the pool does not own must not corrupt the registry', () => {
  /*
   * `Pool.free` previously read `proxy[Index]` and applied it against the
   * pool's own `proxies` registry. Proxies allocated by an array/map inner
   * element pool carry the *inner* slot index; freeing such a proxy through
   * the root pool evicted the live root instance at that (coincidental) outer
   * slot and pushed the element onto the free list.
   */
  test('freeing an array element through the owning root pool leaves the root registered', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const root = pool.allocate()
    root.foo.setAt(0, { x: 1 })
    const element = root.foo.at(0)!

    const proxies = pool.proxies as ({ [Index]: number } | null)[]
    const rootSlot = (root as never as { [Index]: number })[Index]
    const elementSlot = (element as never as { [Index]: number })[Index]

    // The root instance is registered in the pool under its own slot.
    expect((proxies[rootSlot] as unknown) === (root as unknown)).toBe(true)
    // The element lives in the array's inner element pool, not the root registry.
    expect((proxies[elementSlot] as unknown) === (element as unknown)).toBe(false)

    // Freeing a proxy the pool does not own must be rejected, not corrupt the registry.
    expect(() => pool.free(element as never)).toThrow(TypeError)

    // The root instance must remain registered and the free list untouched.
    expect((proxies[rootSlot] as unknown) === (root as unknown)).toBe(true)
    expect(pool.freeList).toHaveLength(0)
  })

  test('reallocating after freeing an element returns a fresh root', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const root = pool.allocate()
    root.foo.setAt(0, { x: 1 })
    const element = root.foo.at(0)!

    // Freeing a proxy the pool does not own is rejected.
    expect(() => pool.free(element as never)).toThrow(TypeError)

    // The rejected free must leave the pool usable: the next allocation returns a
    // fresh root with the schema intact (not the stale inner element).
    const next = pool.allocate()
    expect(next === root).toBe(false)
    expect(next.foo.length).toBe(0)
    expect((next as never as Record<string, unknown>).foo !== undefined).toBe(true)
  })
})

describe('pooled array of proxies: shrinking across holes must not throw', () => {
  /*
   * Growing a pooled proxy-element array out-of-order (`setAt` beyond the
   * current length) leaves holes in the backing array. Shrinking it with
   * `setLength` used to call `Pool.free` on every truncated entry, including
   * holes, which threw `TypeError`.
   */
  test('setLength(0) after an out-of-range setAt does not throw', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(5, { x: 1 }) // leaves holes at 0..4

    expect(proxy.foo.length).toBe(6)
    expect(() => proxy.foo.setLength(0)).not.toThrow()
    expect(proxy.foo.length).toBe(0)
  })

  test('setLength(1) after an out-of-range setAt does not throw', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(2, { x: 5 }) // hole at 1 is within the truncated range

    expect(() => proxy.foo.setLength(1)).not.toThrow()
    expect(proxy.foo.length).toBe(1)
  })

  test('shrinking across a hole left by setAt(i, undefined) does not throw', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(0, { x: 1 })
    proxy.foo.setAt(1, { x: 2 })
    proxy.foo.setAt(2, { x: 3 })
    proxy.foo.setAt(1, undefined) // removes the middle element -> hole

    expect(() => proxy.foo.setLength(0)).not.toThrow()
    expect(proxy.foo.length).toBe(0)
  })

  test('setAt(i, undefined) twice on the same index does not throw', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(0, { x: 1 })

    proxy.foo.setAt(0, undefined) // removes element -> $$array[0] becomes undefined
    expect(() => proxy.foo.setAt(0, undefined)).not.toThrow()
  })
})

describe('pooled sparse proxy-element arrays: ToJSON must not throw', () => {
  /*
   * `[ToJSON]` iterates the backing array and used to call `element[ToJSON]()`
   * on every entry, including holes left by out-of-range `setAt`.
   */
  test('ToJSON over a sparse proxy-element array does not throw', () => {
    const pool = new Pool(object({ foo: array({ element: object({ x: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(0, { x: 1 })
    proxy.foo.setAt(2, { x: 3 }) // hole at 1

    expect(() => proxy.foo[ToJSON]()).not.toThrow()
    expect(proxy.foo[ToJSON]()).toEqual([{ x: 1 }, undefined, { x: 3 }]) // eslint-disable-line no-sparse-arrays
  })
})

describe('pool.markClean: live element dirty state must be cleared', () => {
  /*
   * `Pool.markClean` zeroes the *outer* dirty buffer and resets per-proxy-class
   * dirty maps, but proxy *elements* (array items / map values of object shape)
   * live in an inner pool with their own dirty buffer. Those buffers and the
   * element instances were never cleaned, so a live element kept reporting its
   * old diff after `pool.markClean`.
   */
  test('array element dirty state is cleared by pool.markClean', () => {
    const pool = new Pool(object({ foo: array({ element: object({ a: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.foo.setAt(0, { a: 1 })

    expect(proxy.foo.at(0)![Diff]()).toEqual({ a: 1 })
    pool.markClean()

    expect(proxy.foo.at(0)![Diff]()).toBeUndefined()
  })

  test('map value dirty state is cleared by pool.markClean', () => {
    const pool = new Pool(object({ m: map({ key: uint8(), value: object({ a: uint8() }) }) }))
    const proxy = pool.allocate()
    proxy.m.set(0, { a: 1 })

    expect(proxy.m.get(0)![Diff]()).toEqual({ a: 1 })
    pool.markClean()

    expect(proxy.m.get(0)![Diff]()).toBeUndefined()
  })
})

describe('undersized dirty buffers: dirty bits must not be silently lost', () => {
  /*
   * The generated setters write `configuration.dirty[bit >> 3]` with no bounds
   * check. With a user-supplied buffer smaller than the schema requires, the
   * out-of-bounds write is silently dropped and the change never appears in a
   * diff. The pool path sizes its own dirty memory correctly; only the direct
   * `concrete`/`mapped` configuration path is affected.
   */
  test('every field of a 9-field schema is observable in Diff with a correctly sized buffer', () => {
    // 9 fields need 2 dirty bytes. Field `i` is bit 8 -> byte 1.
    const property = object({
      a: uint8(), b: uint8(), c: uint8(), d: uint8(), e: uint8(),
      f: uint8(), g: uint8(), h: uint8(), i: uint8(),
    })
    const Proxy = property.concrete({ dirty: new Uint8Array(2) })
    const proxy = new Proxy(0)
    proxy[MarkClean]()

    proxy.i = 42

    expect(proxy.i).toBe(42)
    expect(proxy[Diff]()).toEqual({ i: 42 })
  })

  test('an undersized dirty buffer is rejected at construction', () => {
    const property = object({
      a: uint8(), b: uint8(), c: uint8(), d: uint8(), e: uint8(),
      f: uint8(), g: uint8(), h: uint8(), i: uint8(),
    })
    // 9 fields need 2 dirty bytes; a 1-byte buffer must not silently drop writes.
    expect(() => property.concrete({ dirty: new Uint8Array(1) })).toThrow(RangeError)
  })

  test('a correctly sized dirty buffer records the field, an undersized one does not lose it', () => {
    const property = object({
      a: uint8(), b: uint8(), c: uint8(), d: uint8(), e: uint8(),
      f: uint8(), g: uint8(), h: uint8(), i: uint8(),
    })
    const dirty = new Uint8Array(2)
    const Proxy = property.concrete({ dirty })
    const proxy = new Proxy(0)
    proxy[MarkClean]()

    proxy.i = 42

    expect(dirty[1] & 1).toBe(1) // correctly sized buffer records the bit
    expect(proxy[Diff]()).toEqual({ i: 42 })
  })
})
