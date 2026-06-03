import { map as crunchesMap } from 'crunches'

import { Pool } from './pool.js';
import { Propertea } from './propertea.ts'
import {
  Diff,
  MarkClean,
  type ProxyCreatorConcreteConfiguration,
  type ProxyMixedCreator,
  ProxyProperty,
  Set as ProperteaSet,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
  type ProxyDecorator,
  type ProxyMixed,
} from './proxy.js';

const Key = Symbol('Index');
const MapSymbol = Symbol('MapSymbol');

type MapKey = number | string

type MapDiff<K, V> = MapEntry<K, V>[]
type MapEntry<K, V> = [K, V]
type MapSettable<K, V> = Iterable<[K, V]> | MapDiff<K, V>

interface MapProxyInterface<K, V, Stored = V> {
  dirty: Set<number>
  pool: any
  [ToJSON](): MapEntry<K, V>[]
  [ToJSONWithoutDefaults](defaults?: any): MapEntry<K, V>[] | undefined
  [ProperteaSet](value?: MapSettable<K, V>): void
  [SetWithDefaults](value?: MapSettable<K, V>): void
  clear(): void
  delete(key: K): void
  get(key: K): Stored | undefined
  set(key: K, value: V | undefined): void
}

const nop = () => {};

export class ProperteaMap<
  Key extends Propertea<MapKey>,
  Value extends Propertea<unknown>,
  Extension extends object = {},
  Stored = Value extends ProxyProperty<any> ? ProxyMixed<Value['_T']> : Value['_T'],
>
  extends ProxyProperty<
    MapProxyInterface<Key['_T'], Value['_T'], Stored>,
    Extension,
    MapSettable<Key['_T'], Value['_T']>
  >
{

  codec: ReturnType<typeof crunchesMap>
  decorate: ProxyDecorator<MapProxyInterface<Key['_T'], Value['_T'], Stored>, Extension> | undefined
  keyProperty: Key
  valueProperty: Value

  constructor(
    { key, value }: { key: Key; value: Value },
    decorate?: ProxyDecorator<MapProxyInterface<Key['_T'], Value['_T'], Stored>, Extension>,
  ) {
    super();
    this.decorate = decorate
    this.keyProperty = key
    this.valueProperty = value
    this.codec = crunchesMap({ key: key.codec, value: value.codec })
  }

  concrete(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {

    const { defaultValue, valueProperty } = this;
    const { dirtyByteWidth } = valueProperty;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;

    class MapProxy {
      $$map: Map<Key['_T'], Value['_T']> = new Map()
      dirty = new Set<Key['_T']>();
      constructor() {
        this[ProperteaSet](defaultValue);
      }
      [Symbol.iterator]() {
        return this.$$map.entries()
      }
      [ProperteaSet](value?: MapSettable<Key['_T'], Value['_T']>): void {
        if (!value) {
          return;
        }
        this.clear();
        for (const entry of value) {
          this.set(entry[0], entry[1]);
        }
      }
      [SetWithDefaults](value?: MapSettable<Key['_T'], Value['_T']>): void {
        this[ProperteaSet](value)
      }
      clear() {
        for (const entry of this.$$map) {
          this.delete(entry[0]);
        }
      }
      get(key: Key['_T']) {
        return this.$$map.get(key)
      }
      [ToJSONWithoutDefaults](_defaults?: any): MapEntry<Key['_T'], Value['_T']>[] | undefined {
        return this[ToJSON]()
      }
    }

    interface MapProxy {
      [Diff](): Record<string, any> | undefined
      [MarkClean](): void
      [ProperteaSet](value?: MapSettable<Key['_T'], Value['_T']>): void
      [SetWithDefaults](value?: MapSettable<Key['_T'], Value['_T']>): void
      [ToJSON](): MapEntry<Key['_T'], Value>[]
      [ToJSONWithoutDefaults](defaults?: any): MapEntry<Key['_T'], Value>[] | undefined
      pool: any
      delete(key: Key['_T']): void
      get(key: Key['_T']): Stored | undefined
      set(key: Key['_T'], value: Value['_T'] | undefined): void
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
      MapProxy.prototype[ToJSON] = function(): MapEntry<Key['_T'], Value['_T']>[] {
        const json: any[] = [];
        for (const entry of this.$$map) {
          json.push([entry[0], entry[1][ToJSON]()]);
        }
        return json;
      }
      MapProxy.prototype.delete = function(key: Key['_T']) {
        if (this.$$map.has(key)) {
          pool.free(this.get(key));
        }
        this.$$map.delete(key);
        this.dirty.add(key);
      }
      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
        this.dirty.add(key);
        if (this.$$map.has(key)) {
          this.$$map.get(key)[ProperteaSet](value instanceof Concrete ? (value as typeof valueProperty['_T'])[ToJSON]() : value);
        }
        else {
          const localValue = pool.allocate(undefined, (proxy: any) => {
            proxy[Key] = key;
            proxy[MapSymbol] = this;
          });
          localValue[ProperteaSet](value instanceof Concrete ? (value as typeof valueProperty['_T'])[ToJSON]() : value);
          this.$$map.set(key, localValue)
        }
      }
      MapProxy.prototype[Diff] = function() {
        const entries = [];
        for (const dirty of this.dirty) {
          const v = this.get(dirty);
          // recursively generate diff
          entries.push([dirty, undefined === v ? undefined : v[Diff]()]);
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
    else {
      MapProxy.prototype[ToJSON] = function(): MapEntry<Key['_T'], Value['_T']>[] {
        const json: any[] = [];
        for (const entry of this.$$map) {
          json.push(entry);
        }
        return json;
      }
      MapProxy.prototype.delete = function(key: Key['_T']) {
        this.dirty.add(key);
        this.$$map.delete(key);
      }
      MapProxy.prototype.set = function(key: Key['_T'], value: Value['_T']) {
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
        ? this.decorate(MapProxy as unknown as new (index: number) => MapProxyInterface<Key['_T'], Value['_T'], Stored>)
        : MapProxy
      ) as ProxyMixedCreator<MapProxyInterface<Key['_T'], Value['_T'], Stored> & Extension>
  }

  mapped(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

};

export function map<
  K extends Propertea<MapKey>,
  V extends Propertea<unknown>,
  E extends object = {},
  Stored = V extends ProxyProperty<any> ? ProxyMixed<V['_T']> : V['_T'],
>(
  options: { key: K; value: V },
  decorate?: ProxyDecorator<MapProxyInterface<K['_T'], V['_T'], Stored>, E>,
) {
  return new ProperteaMap(options, decorate)
}
