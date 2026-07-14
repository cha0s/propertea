import { expect, test } from 'vitest'

import { json } from './json.ts'
import { Diff, MarkClean, Set, ToJSON } from './proxy.js'

test('default value', () => {
  const property = json().default({ foo: 'bar', baz: [1, 2, 3] })
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  expect(proxy[Diff]()).toEqual({ foo: 'bar', baz: [1, 2, 3] })
})

test('merge and diff', () => {
  const property = json()
  const Proxy = property.concrete({ dirty: new Uint8Array(1) })
  const proxy = new Proxy(0)
  expect(proxy[Diff]()).toEqual({})
  proxy[MarkClean]()
  expect(proxy[Diff]()).toEqual(undefined)
  proxy[Set]({ foo: 'boo' })
  proxy[Set]({ foo: 'bar', baz: [1, 2, 3] })
  expect(proxy[Diff]()).toEqual({ foo: 'bar', baz: [1, 2, 3] })
  expect(proxy[ToJSON]()).toEqual({ foo: 'bar', baz: [1, 2, 3] })
  proxy[MarkClean]()
  proxy.patch({ baz: { 1: 5 } })
  expect(proxy[Diff]()).toEqual({ baz: { 1: 5 } })
  expect(proxy[ToJSON]()).toEqual({ foo: 'bar', baz: [1, 5, 3] })
  proxy.patch(null)
  expect(proxy[ToJSON]()).toEqual(null)
})
