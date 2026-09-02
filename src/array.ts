import { CrunchesArray, CrunchesMap, CrunchesOptional, CrunchesType, CrunchesVarInt, type Target } from 'crunches'

import { Pool } from './pool.ts'
import { Propertea } from './propertea.ts'
import {
  DataOffset,
  Diff,
  DirtyOffset,
  Initialize,
  MarkClean,
  type ProxyClass,
  type ProxyConstructorConcreteConfiguration,
  type ProxyDecorator,
  type ProxyConstructorMixed,
  ProxyPropertea,
  Set as ProperteaSet,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.ts'
import { type DeepPartial, type ProperteaValue } from './internal-types.ts'

const Key = Symbol('Propertea.array.Index')
const ArraySymbol = Symbol('Propertea.array.Symbol')
const Dirty = Symbol('Propertea.array.Dirty')

const nop = () => {}

type ProperteaArrayDiff<
  E extends CrunchesType<unknown, unknown>
> = Record<number, E['_output'] | E['_input'] | undefined>

interface ProperteaArrayProxy<
  Element extends Propertea<any>,
  Stored = Element['_T']
> extends ProxyClass {

  [Diff](): ProperteaArrayDiff<Element['codec']['inner']> | undefined
  [Initialize](value?: Iterable<Element['_T']>): void
  [ProperteaSet](value: ProperteaArrayDiff<Element['codec']['inner']>): void
  [Symbol.iterator](): Iterator<Element['_T']>
  [ToJSON](): Element['_T'][]
  [ToJSONWithoutDefaults](defaults?: any): Element['_T'][] | undefined

  /**
   * Get the element at index.
   * @param index The array index.
   */
  at(index: number): Stored | undefined
  /**
   * The array length.
   */
  get length(): number
  /**
   * Test whether this array includes a value.
   * @param value The value to test for.
   */
  includes(value: Element['_T']): boolean
  /**
   * Set a value at a specific index.
   * @param index The array index.
   * @param value The value to set.
   */
  setAt(index: number, value: Element['_T'] | undefined): void
  /**
   * Set the array length.
   * @param length The length to set.
   */
  setLength(length: number): void

}

/**
 * Custom codec to encode and decode either an array or an array diff.
 */
export class ProperteaArrayCodec<
  E extends CrunchesType<unknown, unknown>
>
  extends CrunchesType<
    Array<E['_output'] | undefined> | ProperteaArrayDiff<E>,
    Iterable<E['_input'] | undefined> | Map<number, E['_input'] | undefined>
  >
{

  arrayCodec: CrunchesArray<E, true>
  mapCodec: CrunchesMap<CrunchesVarInt, E, true>

  constructor({ element }: { element: E }) {
    super()
    this.arrayCodec = new CrunchesArray({ element, sparse: true })
    this.mapCodec = new CrunchesMap({ key: new CrunchesVarInt(), value: element, sparse: true })
  }

  /* v8 ignore next 5 */
  bigEndian(): this {
    this.arrayCodec.bigEndian()
    this.mapCodec.bigEndian()
    return super.bigEndian()
  }

  decodeFrom(view: DataView, target: Target): Array<E['_output'] | undefined> | ProperteaArrayDiff<E> {
    const isDiff = view.getUint8(target.byteOffset)
    target.byteOffset += 1
    if (isDiff) {
      const map = this.mapCodec.decodeFrom(view, target)
      const diff: ProperteaArrayDiff<E> = {}
      for (const [key, value] of map) {
        diff[key] = value
      }
      return diff
    }
    else {
      return this.arrayCodec.decodeFrom(view, target) as any
    }
  }

  encodeInto(value: (Iterable<E['_input'] | undefined>) | ProperteaArrayDiff<E>, view: DataView, byteOffset: number): number {
    let written = 0
    const isDiff = !(Symbol.iterator in value)
    view.setUint8(byteOffset + written, isDiff ? 1 : 0)
    written += 1
    if (isDiff) {
      const diff: [number, E['_input'] | undefined][] = []
      for (const key in value) {
        diff.push([Number(key), value[key]])
      }
      written += this.mapCodec.encodeInto(diff, view, byteOffset + written)
    }
    else {
      written += this.arrayCodec.encodeInto(value as any, view, byteOffset + written)
    }
    return written
  }

  /* v8 ignore next 5 */
  littleEndian(): this {
    this.arrayCodec.littleEndian()
    this.mapCodec.littleEndian()
    return super.littleEndian()
  }

  sizeOf(value: (Iterable<E['_input'] | undefined>) | ProperteaArrayDiff<E>, byteOffset: number) {
    let size = 0
    size += 1
    const isDiff = !(Symbol.iterator in value)
    if (isDiff) {
      const diff: [number, E['_input'] | undefined][] = []
      for (const key in value) {
        diff.push([Number(key), value[key]])
      }
      size += this.mapCodec.sizeOf(diff, byteOffset + size)
    }
    else {
      size += this.arrayCodec.sizeOf(value as any, byteOffset + size)
    }
    return size
  }

}

/**
 * Propertea array.
 */
export class ProperteaArray<
  Element extends Propertea<unknown>,
  Extension extends object = {},
  Stored = ProperteaValue<Element>,
>
  extends ProxyPropertea<
    ProperteaArrayProxy<Element, Stored>,
    Extension,
    Iterable<Element['_T']> | undefined
  >
{

  codec: CrunchesOptional<ProperteaArrayCodec<Element['codec']['inner']>>
  decorate: ProxyDecorator<ProperteaArrayProxy<Element, Stored>, Extension> | undefined
  element: Element

  constructor(
    { element }: { element: Element },
    decorate?: ProxyDecorator<ProperteaArrayProxy<Element, Stored>, Extension>,
  ) {
    super()
    this.decorate = decorate
    this.element = element
    this.codec = new ProperteaArrayCodec({ element: element.codec.inner }).optional()
  }

  concrete(
    configuration: ProxyConstructorConcreteConfiguration,
    isRoot = true,
  ) {
    const { defaultValue, element } = this
    const { byteWidth, dirtyBitWidth } = element
    const onDirtyCallback = configuration.onDirty ?? nop
    let dirtyMap = new WeakMap<any, Set<number>>()
    let pool: any
    if (element instanceof ProxyPropertea) {
      pool = new Pool(
        element,
        {
          onDirty: (bit) => {
            const proxy = pool.proxies[Math.trunc(bit / dirtyBitWidth)]
            if (proxy) {
              onDirtyCallback(proxy[ArraySymbol][DirtyOffset])
              proxy[ArraySymbol][Dirty]().add(proxy[Key])
            }
          },
        },
      )
      pool.ProxyConstructor = class extends pool.ProxyConstructor {
        ;[Key]: number | undefined = undefined
        ;[ArraySymbol]: ArrayProxy | undefined = undefined
      }
    }

    class ArrayProxy {

      ;[DataOffset]: number
      ;[DirtyOffset]: number
      $$array: Element['_T'][] = []
      $$pool: any = pool

      constructor(indexOrDataOffset: number, dirtyOffset?: number) {
        this[DataOffset] = isRoot ? indexOrDataOffset * byteWidth : indexOrDataOffset
        this[DirtyOffset] = isRoot ? indexOrDataOffset * dirtyBitWidth : dirtyOffset!
        dirtyMap.set(this, new Set<number>())
        this[Initialize](defaultValue)
      }

      ;[Dirty]() {
        let dirty = dirtyMap.get(this)
        if (dirty) { return dirty }
        dirty = new Set()
        dirtyMap.set(this, dirty)
        return dirty
      }

      ;[ProperteaSet](value: ProperteaArrayDiff<Element['codec']['inner']>): void {
        if (value) {
          for (const k in value) {
            this.setAt(Number(k), value[k])
          }
        }
      }

      ;[Initialize](value?: Iterable<Element['_T']> | ProperteaArrayDiff<Element['codec']['inner']>): void {
        this.setLength(0)
        // ignore any dirty noise from shrinking an existing array
        this[Dirty]().clear()
        if (!value) { return }
        if (Symbol.iterator in value) {
          let i = 0
          for (const elm of value) {
            this.setAt(i++, elm)
          }
        }
        else {
          this[ProperteaSet](value)
        }
      }

      ;[ToJSONWithoutDefaults](_defaults?: any): Element['_T'][] | undefined {
        // An array equal to its default (empty, or holding only default elements)
        // is omitted from a defaults-free serialization.
        if (0 === this.$$array.length) {
          return
        }
        if (element instanceof ProxyPropertea) {
          for (const value of this.$$array) {
            const json = (value as { [ToJSONWithoutDefaults](): unknown } | undefined)?.[ToJSONWithoutDefaults]()
            if (undefined !== value && undefined !== json) {
              return this[ToJSON]()
            }
          }
          return
        }
        for (const value of this.$$array) {
          if (value !== element.defaultValue) {
            return this[ToJSON]()
          }
        }
        return
      }

      ;[Symbol.iterator]() {
        return this.$$array.values()
      }

      at(index: number): Stored {
        return this.$$array[index] as Stored
      }

      includes(value: Element['_T']) {
        return this.$$array.includes(value)
      }

      get length() {
        return this.$$array.length
      }

      static markClean() {
        dirtyMap = new WeakMap<any, Set<number>>()
        pool?.ProxyConstructor.markClean()
      }

    }

    // dynamic shape
    interface ArrayProxy {
      [Diff](): ProperteaArrayDiff<Element['codec']['inner']> | undefined
      [MarkClean](): void
      [ToJSON](): Element['_T'][]
      setAt(index: number, value: Element['_T'] | undefined): void
      setLength(length: number): void
    }

    if (element instanceof ProxyPropertea) {

      ArrayProxy.prototype.setAt = function(index: number, value: DeepPartial<Element['_T']> | undefined) {
        const previous = this.$$array[index]
        if (undefined === value && undefined !== previous) {
          this.$$pool.free(previous)
        }
        this[Dirty]().add(index)
        let localValue
        if (undefined !== previous) {
          previous[ProperteaSet](value)
          localValue = previous
        }
        else {
          localValue = this.$$pool.allocate(value, (proxy: any) => {
            proxy[Key] = index
            proxy[ArraySymbol] = this
          })
        }
        if (undefined !== value) {
          value = localValue
        }
        this.$$array[index] = value
      }

      ArrayProxy.prototype.setLength = function(length: number) {
        const { length: oldLength } = this.$$array
        for (let i = this.$$array.length - 1; i >= length; --i) {
          const value = this.$$array[i]
          if (undefined !== value) {
            this.$$pool.free(value)
          }
          this[Dirty]().add(i)
        }
        for (let i = this.$$array.length; i < length; ++i) {
          this.$$array[i] = this.$$pool.allocate(element.defaultValue, (proxy: any) => {
            proxy[Key] = i
            proxy[ArraySymbol] = this
          })
        }
        if (length < oldLength) {
          onDirtyCallback(this[DirtyOffset])
        }
        this.$$array.length = length
      }

      ArrayProxy.prototype[Diff] = function(): ProperteaArrayDiff<Element['codec']['inner']> | undefined {
        if (0 === this[Dirty]().size) { return }
        const diff: ProperteaArrayDiff<Element['codec']['inner']> = {}
        for (const dirty of this[Dirty]()) {
          const v = this.$$array[dirty]
          diff[dirty] = undefined === v ? undefined : v[Diff]()
        }
        return diff
      }

      ArrayProxy.prototype[MarkClean] = function() {
        this[Dirty]().clear()
        for (const value of this.$$array) {
          if (undefined !== value) {
            value[MarkClean]()
          }
        }
      }

      ArrayProxy.prototype[ToJSON] = function(): Element['_T'][] {
        const json = []
        for (const value of this.$$array) {
          json.push(undefined === value ? undefined : (value as typeof element['_T'])[ToJSON]())
        }
        return json
      }

    }
    else {

      ArrayProxy.prototype.setLength = function(length: number) {
        const { length: oldLength } = this.$$array
        for (let i = this.$$array.length - 1; i >= length; --i) {
          this[Dirty]().add(i)
        }
        for (let i = this.$$array.length; i < length; ++i) {
          this.setAt(i, element.defaultValue)
        }
        if (length < oldLength) {
          onDirtyCallback(this[DirtyOffset])
        }
        this.$$array.length = length
      }

      ArrayProxy.prototype.setAt = function(index: number, value: Element['_T'] | undefined) {
        this[Dirty]().add(index)
        const previous = this.$$array[index]
        this.$$array[index] = value
        if (previous !== value) {
          onDirtyCallback(this[DirtyOffset])
        }
      }

      ArrayProxy.prototype[Diff] = function(): ProperteaArrayDiff<Element['codec']['inner']> | undefined {
        if (0 === this[Dirty]().size) { return }
        const diff: ProperteaArrayDiff<Element['codec']['inner']> = {}
        for (const dirty of this[Dirty]()) {
          diff[dirty] = this.$$array[dirty]
        }
        return diff
      }

      ArrayProxy.prototype[MarkClean] = function() {
        this[Dirty]().clear()
      }

      ArrayProxy.prototype[ToJSON] = function(): Element['_T'][] {
        const json = []
        for (const value of this.$$array) {
          json.push(value)
        }
        return json
      }

    }
    const Decorated = this.decorate ? this.decorate(ArrayProxy) : ArrayProxy
    return Decorated as ProxyConstructorMixed<ProperteaArrayProxy<Element, Stored> & Extension>
  }

  /* v8 ignore next */
  mapped(
    configuration: ProxyConstructorConcreteConfiguration,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

}

/**
 * Create an array Propertea.
 * @param options Array options.
 * @param options.element Array element Propertea.
 * @param decorate Optional proxy decorator function.
 * @returns The array Propertea.
 */
export function array<
  P extends Propertea<unknown>,
  E extends object = {},
  Stored = ProperteaValue<P>,
>(
  options: { element: P },
  decorate?: ProxyDecorator<ProperteaArrayProxy<P, Stored>, E>,
) {
  return new ProperteaArray(options, decorate)
}
