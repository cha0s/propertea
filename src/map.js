import {Codecs} from 'crunches';

import {Pool} from './pool.js';
import {Diff, MarkClean, ProxyProperty, Set as ProperteaSet, SetWithDefaults, ToJSON} from './proxy.js';
import {registry} from './register.js';

const Key = Symbol('Index');
const MapSymbol = Symbol('MapSymbol');

registry.map = class extends ProxyProperty {

  constructor(blueprint) {
    super(blueprint);
    if (!registry[blueprint.value.type]) {
      throw new TypeError(`Propertea(map): value type '${blueprint.value.type}' not registered`);
    }
    this.property = new registry[blueprint.value.type](blueprint.value);
    this.codec = new Codecs.map(blueprint);
  }

  concrete(views = {}) {
    const {blueprint} = this;
    const Proxy = this.generateProxy(views);
    return (blueprint.Proxy ?? ((C) => C))(Proxy);
  }

  generateProxy(views) {
    const {blueprint, property} = this;
    const {dirtyWidth} = property;
    let Concrete;
    let pool;
    if (property instanceof ProxyProperty) {
      Concrete = property.concrete(views);
      pool = new Pool(
        {
          ...blueprint.value,
          Proxy: (Proxy) => class extends Proxy {
            [Key] = undefined;
            [MapSymbol] = undefined;
          },
        },
        {
          onDirty: (bit, proxy) => {
            views.onDirty?.(bit, proxy);
            const index = Math.floor(bit / dirtyWidth);
            if (index < pool.length.value) {
              pool.proxies[index][MapSymbol].dirty.add(pool.proxies[index][Key]);
            }
          },
        },
      );
    }

    // JSON API
    class MapProxy extends Map {

      dirty = new Set();

      constructor() {
        super();
        this[ProperteaSet](blueprint.defaultValue);
      }

      clear() {
        for (const entry of this) {
          this.delete(entry[0]);
        }
      }

      delete(key) {
        if (this.has(key)) {
          pool.free(this.get(key));
        }
        super.delete(key);
        this.dirty.add(key);
      }

      set(key, value) {
        if (property instanceof ProxyProperty) {
          if (this.has(key)) {
            this.get(key)[ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
            value = this[key];
          }
          else {
            const localValue = pool.allocate(undefined, (proxy) => {
              proxy[Key] = key;
              proxy[MapSymbol] = this;
            });
            localValue[ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
            value = localValue;
          }
        }
        this.dirty.add(key);
        super.set(key, value);
      }

      [ToJSON]() {
        const json = [];
        for (const entry of this) {
          json.push([entry[0], property instanceof ProxyProperty ? entry[1][ToJSON]() : entry[1]]);
        }
        return json;
      }
    }
    // dirty API
    if (views.onDirty ?? true) {
      MapProxy.prototype[Diff] = function() {
        const entries = [];
        if (property instanceof ProxyProperty) {
          for (const dirty of this.dirty) {
            const v = this.get(dirty);
            entries.push([dirty, undefined === v ? undefined : v[Diff]()]);
          }
        }
        else {
          for (const dirty of this.dirty) {
            entries.push([dirty, this.get(dirty)])
          }
        }
        return entries;
      };
      MapProxy.prototype[MarkClean] = function() {
        this.dirty.clear();
        if (property instanceof ProxyProperty) {
          for (const entry of this) {
            entry[1][MarkClean]();
          }
        }
      };
    }
    MapProxy.prototype[SetWithDefaults] = function() {};
    MapProxy.prototype[ProperteaSet] = function(entries) {
      if (!entries) {
        return;
      }
      this.clear();
      for (const entry of entries) {
        this.set(entry[0], entry[1]);
      }
    };
    return MapProxy;
  }

  map(views = {}) {
    return this.concrete(views);
  }

}
