import { CrunchesMap, CrunchesOptional } from 'crunches'

import { Pool } from './pool.ts'
import { Propertea } from './propertea.ts'
import { type ProperteaValue } from './internal-types.ts'
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

const Key = Symbol('Propertea.map.Key')
const MapSymbol = Symbol('Propertea.map.MapSymbol')
const Dirty = Symbol('Propertea.map.Dirty')

type MapKey = number | string

type MapDiff<K, V> = MapEntry<K, V>[]
type MapEntry<K, V> = [K, V]
type MapSettable<K, V> = Iterable<[K, V]> | MapDiff<K, V>

interface ProperteaMapProxy<K, V, Stored = V> extends ProxyClass {

  [Initialize](value?: MapSettable<K, V>): void
  [ProperteaSet](value?: MapSettable<K, V>): void
  [ToJSON](): MapEntry<K, V>[]
  [ToJSONWithoutDefaults](defaults?: any): MapEntry<K, V>[] | undefined

  /**
   * Clear all values from the map.
   */
  clear(): void
  /**
   * Delete a value from the map.
   * @param key The key to delete.
   */
  delete(key: K): void
  /**
   * Get a value from the map.
   * @param key The key to use to get the value.
   */
  get(key: K): Stored | undefined
  /**
   * Set a value in the map.
   * @param key The key to use to set the value.
   * @param value The value to set.
   */
  set(key: K, value: V | undefined): void

}

const nop = () => {}

/**
 * Map Propertea.
 */
export class ProperteaMap<
  Key extends Propertea<MapKey>,
  Value extends Propertea<unknown>,
  Extension extends object = {},
  Stored = ProperteaValue<Value>,
>
  extends ProxyPropertea<
    ProperteaMapProxy<Key['_T'], Value['_T'], Stored>,
    Extension,
    MapSettable<Key['_T'], Value['_T']>
  >
{

  codec: CrunchesOptional<CrunchesMap<Key['codec']['inner'], Value['codec']['inner'], true>>
  decorate: ProxyDecorator<ProperteaMapProxy<Key['_T'], Value['_T'], Stored>, Extension> | undefined
  keyProperty: Key
  valueProperty: Value

  constructor(
    { key, value }: { key: Key; value: Value },
    decorate?: ProxyDecorator<ProperteaMapProxy<Key['_T'], Value['_T'], Stored>, Extension>,
  ) {
    super()
    this.decorate = decorate
    this.keyProperty = key
    this.valueProperty = value
    this.codec = new CrunchesMap({ key: key.codec.inner, value: value.codec.inner, sparse: true }).optional()
  }

  concrete(
    configuration: ProxyConstructorConcreteConfiguration,
    isRoot = true,
  ) {

    const { defaultValue, valueProperty } = this
    const { byteWidth, dirtyBitWidth } = valueProperty
    const onDirtyCallback = configuration.onDirty ?? nop
    let dirtyMap = new WeakMap<any, Set<Key['_T']>>()
    let pool: any
    if (valueProperty instanceof ProxyPropertea) {
      pool = new Pool(
        valueProperty,
        {
          onDirty: (bit) => {
            const proxy = pool.proxies[Math.trunc(bit / dirtyBitWidth)]
            if (proxy) {
              onDirtyCallback(proxy[MapSymbol][DirtyOffset])
              proxy[MapSymbol][Dirty]().add(proxy[Key])
            }
          },
        },
      )
      pool.ProxyConstructor = class ProperteaMapPoolProxy extends pool.ProxyConstructor {
        ;[MapSymbol]: MapProxy | undefined = undefined
        ;[Key]: number | undefined = undefined
      }
    }

    class MapProxy {

      ;[DataOffset]: number
      ;[DirtyOffset]: number
      $$map: Map<Key['_T'], Value['_T']> = new Map()
      $$pool: any = pool

      constructor(indexOrDataOffset: number, dirtyOffset?: number) {
        this[DataOffset] = isRoot ? indexOrDataOffset * byteWidth : indexOrDataOffset
        this[DirtyOffset] = isRoot ? indexOrDataOffset * dirtyBitWidth : dirtyOffset!
        dirtyMap.set(this, new Set())
        this[Initialize](defaultValue)
      }

      ;[Dirty]() {
        let dirty = dirtyMap.get(this)
        if (dirty) {
          return dirty
        }
        dirty = new Set()
        dirtyMap.set(this, dirty)
        return dirty
      }

      ;[Symbol.iterator]() {
        return this.$$map.entries()
      }

      ;[ProperteaSet](value?: MapSettable<Key['_T'], Value['_T']>): void {
        if (!value) {
          return
        }
        for (const entry of value) {
          if (undefined === entry[1]) {
            this.delete(entry[0])
          }
          else {
            this.set(entry[0], entry[1])
          }
        }
      }

      ;[Initialize](value?: MapSettable<Key['_T'], Value['_T']>): void {
        this.clear()
        if (!value) {
          return
        }
        // ignore any dirty noise from shrinking an existing array
        this[Dirty]().clear()
        this[ProperteaSet](value)
      }

      get(key: Key['_T']) {
        return this.$$map.get(key)
      }

      static markClean() {
        dirtyMap = new WeakMap<any, Set<Key['_T']>>()
        pool?.ProxyConstructor.markClean()
      }

      ;[ToJSONWithoutDefaults](_defaults?: any): MapEntry<Key['_T'], Value['_T']>[] | undefined {
        // A map equal to its default (empty, or holding only default values)
        // is omitted from a defaults-free serialization.
        if (0 === this.$$map.size) {
          return
        }
        if (valueProperty instanceof ProxyPropertea) {
          for (const entry of this.$$map) {
            const valueJson = (entry[1] as { [ToJSONWithoutDefaults](): unknown } | undefined)?.[ToJSONWithoutDefaults]()
            if (undefined !== entry[1] && undefined !== valueJson) {
              return this[ToJSON]()
            }
          }
          return
        }
        for (const entry of this.$$map) {
          if (entry[1] !== valueProperty.defaultValue) {
            return this[ToJSON]()
          }
        }
        return
      }
    }

    interface MapProxy {

      [Diff](): Iterable<[any, any]> | undefined
      [MarkClean](): void
      [Initialize](value?: MapSettable<Key['_T'], Value['_T']>): void
      [ProperteaSet](value?: MapSettable<Key['_T'], Value['_T']>): void
      [ToJSON](): MapEntry<Key['_T'], Value>[]
      [ToJSONWithoutDefaults](defaults?: any): MapEntry<Key['_T'], Value>[] | undefined

      $$pool: any

      clear(): void
      delete(key: Key['_T']): void
      get(key: Key['_T']): Stored | undefined
      set(key: Key['_T'], value: Value['_T'] | undefined): void

    }

    if (valueProperty instanceof ProxyPropertea) {

      MapProxy.prototype[ToJSON] = function(): MapEntry<Key['_T'], Value['_T']>[] {
        const json: any[] = []
        for (const entry of this.$$map) {
          json.push([entry[0], entry[1][ToJSON]()])
        }
        return json
      }

      MapProxy.prototype.clear = function() {
        if (0 === this.$$map.size) {
          return
        }
        for (const key of this.$$map.keys()) {
          this.$$pool.free(this.get(key))
          this.$$map.delete(key)
          this[Dirty]().add(key)
        }
        onDirtyCallback(this[DirtyOffset])
      }

      MapProxy.prototype.delete = function(key: Key['_T']) {
        if (this.$$map.has(key)) {
          this.$$pool.free(this.get(key))
          this.$$map.delete(key)
          onDirtyCallback(this[DirtyOffset])
          this[Dirty]().add(key)
        }
      }

      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
        if (undefined === value) {
          this.delete(key)
          return
        }
        this[Dirty]().add(key)
        if (this.$$map.has(key)) {
          this.$$map.get(key)[ProperteaSet](value)
        }
        else {
          const localValue = this.$$pool.allocate(value, (proxy: any) => {
            proxy[MapSymbol] = this
            proxy[Key] = key
          })
          this.$$map.set(key, localValue)
        }
      }

      MapProxy.prototype[Diff] = function() {
        if (0 === this[Dirty]().size) { return }
        const entries: [any, any][] = []
        for (const dirty of this[Dirty]()) {
          const v = this.get(dirty)
          // recursively generate diff
          entries.push([dirty, undefined === v ? undefined : v[Diff]()])
        }
        return entries
      }

      MapProxy.prototype[MarkClean] = function() {
        this[Dirty]().clear()
        for (const entry of this.$$map) {
          if (undefined !== entry[1]) {
            entry[1][MarkClean]()
          }
        }
      }

    }
    else {

      MapProxy.prototype[ToJSON] = function(): MapEntry<Key['_T'], Value['_T']>[] {
        const json: any[] = []
        for (const entry of this.$$map) {
          json.push(entry)
        }
        return json
      }

      MapProxy.prototype.clear = function() {
        if (0 === this.$$map.size) {
          return
        }
        for (const key of this.$$map.keys()) {
          this.$$map.delete(key)
          this[Dirty]().add(key)
        }
        onDirtyCallback(this[DirtyOffset])
      }

      MapProxy.prototype.delete = function(key: Key['_T']) {
        if (this.$$map.has(key)) {
          this[Dirty]().add(key)
          this.$$map.delete(key)
          onDirtyCallback(this[DirtyOffset])
        }
      }

      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
        if (undefined === value) {
          this.delete(key)
          return
        }
        const previous = this.$$map.get(key)
        this[Dirty]().add(key)
        this.$$map.set(key, value)
        if (previous !== value) {
          onDirtyCallback(this[DirtyOffset])
        }
      }

      MapProxy.prototype[Diff] = function() {
        if (0 === this[Dirty]().size) { return }
        const entries: [any, any][] = []
        for (const dirty of this[Dirty]()) {
          entries.push([dirty, this.$$map.get(dirty)])
        }
        return entries
      }

      MapProxy.prototype[MarkClean] = function() {
        this[Dirty]().clear()
      }

    }
    const Decorated = this.decorate ? this.decorate(MapProxy) : MapProxy
    return Decorated as (
      ProxyConstructorMixed<ProperteaMapProxy<Key['_T'], Value['_T'], Stored> & Extension>
    )
  }

  mapped(
    configuration: ProxyConstructorConcreteConfiguration,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

}

/**
 * Create Map Propertea.
 */
export function map<
  K extends Propertea<MapKey>,
  V extends Propertea<unknown>,
  E extends object = {},
  Stored = ProperteaValue<V>,
>(
  options: { key: K; value: V },
  decorate?: ProxyDecorator<ProperteaMapProxy<K['_T'], V['_T'], Stored>, E>,
) {
  return new ProperteaMap(options, decorate)
}
