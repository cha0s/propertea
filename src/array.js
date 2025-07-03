import {Codecs} from 'crunches';

import {Pool} from './pool.js';
import {Diff, Initialize, MarkClean, ProxyProperty, Set as ProperteaSet, ToJSON} from './proxy.js';
import {registry} from './register.js';

const Key = Symbol('Index');
const ArraySymbol = Symbol('ArraySymbol');

registry.array = class extends ProxyProperty {

  constructor(blueprint) {
    super(blueprint);
    if (!registry[blueprint.element.type]) {
      throw new TypeError(`Propertea: '${blueprint.element.type}' not registered`);
    }
    this.property = new registry[blueprint.element.type](blueprint.element);
    this.codec = new Codecs.array(blueprint);
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
          ...blueprint.element,
          Proxy: (Proxy) => class extends Proxy {
            [Key] = undefined;
            [ArraySymbol] = undefined;
          },
        },
        {
          onDirty: (bit, proxy, key, property) => {
            views.onDirty?.(bit, proxy, key, property);
            const index = Math.floor(bit / dirtyWidth);
            if (index < pool.length.value) {
              pool.proxies[index][ArraySymbol].dirty.add(pool.proxies[index][Key]);
            }
          },
        },
      );
    }

    // JSON API
    class ArrayProxy extends Array {

      constructor() {
        super();
      }

      dirty = new Set();

      setLength(length) {
        for (let i = this.length - 1; i >= length; --i) {
          if (property instanceof ProxyProperty) {
            pool.free(this[i]);
          }
          this.dirty.add(i);
        }
        super.length = length;
      }

      setAt(key, value) {
        if (property instanceof ProxyProperty) {
          if (this[key]) {
            this[key][ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
            value = this[key];
          }
          else {
            const localValue = pool.allocate(undefined, (proxy) => {
              proxy[Key] = key;
              proxy[ArraySymbol] = this;
            });
            localValue[ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
            value = localValue;
          }
        }
        this.dirty.add(key);
        this[key] = value;
      }

      [ToJSON]() {
        const json = [];
        for (const value of this) {
          json.push(property instanceof ProxyProperty ? value[ToJSON]() : value);
        }
        return json;
      }
    }
    // dirty API
    if (views.onDirty ?? true) {
      ArrayProxy.prototype[Diff] = function() {
        const entries = {};
        if (property instanceof ProxyProperty) {
          for (const dirty of this.dirty) {
            const v = this[dirty];
            entries[dirty] = undefined === v ? undefined : v[Diff]();
          }
        }
        else {
          for (const dirty of this.dirty) {
            entries[dirty] = this[dirty];
          }
        }
        return entries;
      };
      ArrayProxy.prototype[MarkClean] = function() {
        this.dirty.clear();
        if (property instanceof ProxyProperty) {
          for (const value of this) {
            value[MarkClean]();
          }
        }
      };
    }
    ArrayProxy.prototype[Initialize] = function() {};
    ArrayProxy.prototype[ProperteaSet] = function(iterable) {
      this.setLength(0);
      let i = 0;
      for (const value of iterable) {
        this.setAt(i++, value);
      }
    };
    return ArrayProxy;
  }

  map(views = {}) {
    return this.concrete(views);
  }

}
