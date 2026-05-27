import { map as crunchesMap } from 'crunches'

import { Pool } from './pool.js';
import {
  Diff,
  MarkClean,
  type ProxyCreatorConfiguration,
  type ProxyMixedCreator,
  ProxyProperty,
  Set as ProperteaSet,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
  type ProxyDecorator,
  type ProxyMixed,
  type HasDirty,
} from './proxy.js';
import { Property } from './types.ts'

const Key = Symbol('Index');
const MapSymbol = Symbol('MapSymbol');

type MapKey = number | string

type MapDiff<K, V> = MapEntry<K, V>[]
type MapEntry<K, V> = [K, V]

interface MapProxyInterface<K, V, Stored = V> {
  dirty: Set<number>
  pool: any
  [ToJSON](): MapEntry<K, V>[]
  [ToJSONWithoutDefaults](defaults?: any): MapEntry<K, V>[] | undefined
  [ProperteaSet](value?: Iterable<[K, V]> | MapDiff<K, V>): void
  [SetWithDefaults](value?: Iterable<[K, V]> | MapDiff<K, V>): void
  clear(): void
  delete(key: K): void
  get(key: K): Stored | undefined
  set(key: K, value: V | undefined): void
}

const nop = () => {};

export class ProperteaMap<
  K extends Property<MapKey>,
  V extends Property<unknown>,
  E extends object = {},
  Stored = V extends ProxyProperty<any> ? ProxyMixed<V['_T'], true> : V['_T'],
>
  extends ProxyProperty<MapProxyInterface<K['_T'], V['_T'], Stored>, Iterable<[K['_T'], V['_T']]> | MapDiff<K['_T'], V['_T']>>
{

  codec: ReturnType<typeof crunchesMap>
  decorate: ProxyDecorator<MapProxyInterface<K['_T'], V['_T'], Stored>, E> | undefined
  keyProperty: K
  valueProperty: V

  constructor(
    { key, value }: { key: K; value: V },
    decorate?: ProxyDecorator<MapProxyInterface<K['_T'], V['_T'], Stored>, E>,
  ) {
    super();
    this.decorate = decorate
    this.keyProperty = key
    this.valueProperty = value
    this.codec = crunchesMap({ key: key.codec, value: value.codec })
  }


  concrete<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {

    const { defaultValue, valueProperty } = this;
    const { dirtyByteWidth } = valueProperty;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;

    class MapProxy {
      $$map: Map<K['_T'], V['_T']> = new Map()
      dirty = new Set<K['_T']>();
      constructor() {
        this[ProperteaSet](defaultValue);
      }
      [ProperteaSet](value?: Iterable<[K['_T'], V['_T']]> | MapDiff<K['_T'], V['_T']>): void {
        if (!value) {
          return;
        }
        this.clear();
        for (const entry of value) {
          this.set(entry[0], entry[1]);
        }
      }
      [SetWithDefaults](value?: Iterable<[K['_T'], V['_T']]> | MapDiff<K['_T'], V['_T']>): void {
        this[ProperteaSet](value)
      }
      clear() {
        for (const entry of this.$$map) {
          this.delete(entry[0]);
        }
      }
      get(key: K['_T']) {
        return this.$$map.get(key)
      }
      [ToJSONWithoutDefaults](_defaults?: any): MapEntry<K['_T'], V['_T']>[] | undefined {
        return this[ToJSON]()
      }
    }

    interface MapProxy {
      [Diff](): Record<string, any> | undefined
      [MarkClean](): void
      [ProperteaSet](value?: Iterable<[K['_T'], V['_T']]> | MapDiff<K['_T'], V['_T']>): void
      [SetWithDefaults](value?: Iterable<[K['_T'], V['_T']]> | MapDiff<K['_T'], V['_T']>): void
      [ToJSON](): MapEntry<K['_T'], V>[]
      [ToJSONWithoutDefaults](defaults?: any): MapEntry<K['_T'], V>[] | undefined
      pool: any
      delete(key: K['_T']): void
      get(key: K['_T']): Stored | undefined
      set(key: K['_T'], value: V['_T'] | undefined): void
    }

    if (valueProperty instanceof ProxyProperty) {

      const Concrete = class extends valueProperty.concrete(configuration, isRoot) {
        [Key]: number | undefined = undefined;
        [MapSymbol]: MapProxy | undefined = undefined;
      }
      const pool = new Pool(
        valueProperty,
        onDirty ? {
          onDirty: (bit, proxy) => {
            onDirtyCallback(bit, proxy);
            const index = Math.floor(bit / dirtyByteWidth);
            if (index < pool.length.value) {
              const proxy = pool.proxies[index] as any
              if (proxy) {
                proxy[MapSymbol].dirty.add(proxy[Key]);
              }
            }
          },
        } : undefined,
      );
      MapProxy.prototype[ToJSON] = function(): MapEntry<K['_T'], V['_T']>[] {
        const json: any[] = [];
        for (const entry of this.$$map) {
          json.push([entry[0], entry[1][ToJSON]()]);
        }
        return json;
      }
      MapProxy.prototype.delete = function(key: K['_T']) {
        if (this.$$map.has(key)) {
          pool.free(this.get(key));
        }
        this.$$map.delete(key);
        this.dirty.add(key);
      }
      MapProxy.prototype.set = function(key: K['_T'], value: V['_T']) {
        this.dirty.add(key);
        if (this.$$map.has(key)) {
          this.$$map.get(key)[ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
        }
        else {
          const localValue = pool.allocate(undefined, (proxy: any) => {
            proxy[Key] = key;
            proxy[MapSymbol] = this;
          });
          localValue[ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
          this.$$map.set(key, localValue)
        }
      }
      if (configuration.onDirty ?? true) {
        MapProxy.prototype[Diff] = function() {
          const entries = [];
          for (const dirty of this.dirty) {
            const v = this.get(dirty);
            // recursively generate diff
            entries.push([dirty, undefined === v ? null : v[Diff]()]);
          }
          return entries;
        };
        MapProxy.prototype[MarkClean] = function() {
          this.dirty.clear();
          for (const entry of this.$$map) {
            entry[1][MarkClean]();
          }
        };
      }
    }
    else {
      MapProxy.prototype[ToJSON] = function(): MapEntry<K['_T'], V['_T']>[] {
        const json: any[] = [];
        for (const entry of this.$$map) {
          json.push(entry);
        }
        return json;
      }
      MapProxy.prototype.delete = function(key: K['_T']) {
        this.dirty.add(key);
        this.$$map.delete(key);
      }
      MapProxy.prototype.set = function(key: K['_T'], value: V['_T']) {
        this.dirty.add(key);
        this.$$map.set(key, value);
      }
      if (configuration.onDirty ?? true) {
        MapProxy.prototype[Diff] = function() {
          const entries = [];
          for (const dirty of this.dirty) {
            entries.push([dirty, this.$$map.get(dirty)]);
          }
          return entries;
        };
        MapProxy.prototype[MarkClean] = function() {
          this.dirty.clear();
        };
      }
    }
    return (
      this.decorate
        ? this.decorate(MapProxy as unknown as new (index: number) => MapProxyInterface<K['_T'], V['_T'], Stored>)
        : MapProxy
      ) as ProxyMixedCreator<MapProxyInterface<K['_T'], V['_T'], Stored> & E, HasDirty<O>>
  }

  mapped<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

};

export function map<
  K extends Property<MapKey>,
  V extends Property<unknown>,
  E extends object = {},
  Stored = V extends ProxyProperty<any> ? ProxyMixed<V['_T'], true> : V['_T'],
>(
  options: { key: K; value: V },
  decorate?: ProxyDecorator<MapProxyInterface<K['_T'], V['_T'], Stored>, E>,
) {
  return new ProperteaMap(options, decorate)
}
