import { CrunchesMap, CrunchesOptional } from 'crunches'

import { Pool } from './pool.js'
import { Propertea } from './propertea.ts'
import {
  DataOffset,
  Diff,
  DirtyOffset,
  Initialize,
  MarkClean,
  type ProxyClass,
  type ProxyCreatorConcreteConfiguration,
  type ProxyDecorator,
  type ProxyMixed,
  type ProxyMixedCreator,
  ProxyProperty,
  Set as ProperteaSet,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.js'

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

  clear(): void
  delete(key: K): void
  get(key: K): Stored | undefined
  set(key: K, value: V | undefined): void

}

const nop = () => {}

export class ProperteaMap<
  Key extends Propertea<MapKey>,
  Value extends Propertea<unknown>,
  Extension extends object = {},
  Stored = Value extends ProxyProperty<any> ? ProxyMixed<Value['_T'] & Value['_E']> : Value['_T'],
>
  extends ProxyProperty<
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
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {

    const { defaultValue, valueProperty } = this
    const { byteWidth, dirtyByteWidth } = valueProperty
    const onDirtyCallback = configuration.onDirty ?? nop
    let dirtyMap = new WeakMap<any, Set<Key['_T']>>()
    let pool: any
    if (valueProperty instanceof ProxyProperty) {
      pool = new Pool(
        valueProperty,
        {
          onDirty: (bit) => {
            const proxy = pool.proxies[Math.trunc(bit / dirtyByteWidth)]
            if (proxy) {
              onDirtyCallback(proxy[MapSymbol][DirtyOffset], proxy[MapSymbol])
              proxy[MapSymbol][Dirty]().add(proxy[Key])
            }
          },
        },
      )
      pool.ProxyCreator = class ProperteaMapPoolProxy extends pool.ProxyCreator {
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
        this[DirtyOffset] = isRoot ? indexOrDataOffset * dirtyByteWidth : dirtyOffset!
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
        pool?.ProxyCreator.markClean()
      }
      ;[ToJSONWithoutDefaults](_defaults?: any): MapEntry<Key['_T'], Value['_T']>[] | undefined {
        return this[ToJSON]()
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

    if (valueProperty instanceof ProxyProperty) {
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
        onDirtyCallback(this[DirtyOffset], this)
      }
      MapProxy.prototype.delete = function(key: Key['_T']) {
        if (this.$$map.has(key)) {
          this.$$pool.free(this.get(key))
          this.$$map.delete(key)
          onDirtyCallback(this[DirtyOffset], this)
          this[Dirty]().add(key)
        }
      }
      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
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
          entry[1][MarkClean]()
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
        onDirtyCallback(this[DirtyOffset], this)
      }
      MapProxy.prototype.delete = function(key: Key['_T']) {
        if (this.$$map.has(key)) {
          this[Dirty]().add(key)
          this.$$map.delete(key)
          onDirtyCallback(this[DirtyOffset], this)
        }
      }
      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
        const previous = this.$$map.get(key)
        this[Dirty]().add(key)
        this.$$map.set(key, value)
        if (previous !== value) {
          onDirtyCallback(this[DirtyOffset], this)
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
      ProxyMixedCreator<ProperteaMapProxy<Key['_T'], Value['_T'], Stored> & Extension>
    )
  }

  mapped(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

}

export function map<
  K extends Propertea<MapKey>,
  V extends Propertea<unknown>,
  E extends object = {},
  Stored = V extends ProxyProperty<any> ? ProxyMixed<V['_T'] & V['_E']> : V['_T'],
>(
  options: { key: K; value: V },
  decorate?: ProxyDecorator<ProperteaMapProxy<K['_T'], V['_T'], Stored>, E>,
) {
  return new ProperteaMap(options, decorate)
}
