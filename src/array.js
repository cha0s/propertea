import {Codecs} from 'crunches';

import {Pool} from './pool.js';
import {Diff, MarkClean, ProxyProperty, Set as ProperteaSet, SetWithDefaults, ToJSON} from './proxy.js';
import {registry} from './register.js';

const Key = Symbol('Index');
const ArraySymbol = Symbol('ArraySymbol');

const nop = () => {};

registry.array = class extends ProxyProperty {

  constructor(blueprint) {
    super(blueprint);
    /* v8 ignore next 5 */
    if (!registry[blueprint.element.type]) {
      throw new TypeError(
        `Propertea(array): element type '${blueprint.element.type}' not registered`,
      );
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
    const onDirty = views.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
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
        onDirty ? {
          onDirty: (bit, proxy) => {
            onDirtyCallback(bit, proxy);
            const index = Math.floor(bit / dirtyWidth);
            if (index < pool.length.value && pool.proxies[index]) {
              pool.proxies[index][ArraySymbol].dirty.add(pool.proxies[index][Key]);
            }
          },
        } : {},
      );
    }

    // JSON API
    class ArrayProxy extends Array {

      constructor() {
        super();
        this.pool = pool;
        this[ProperteaSet](blueprint.defaultValue);
      }

      dirty = new Set();

      setLength(length) {
        for (let i = this.length - 1; i >= length; --i) {
          if (property instanceof ProxyProperty) {
            pool.free(this[i]);
          }
          if (onDirty) {
            this.dirty.add(i);
          }
        }
        super.length = length;
      }

      setAt(key, value) {
        if (undefined === value && property instanceof ProxyProperty && key in this) {
          pool.free(this[key]);
        }
        if (onDirty) {
          this.dirty.add(key);
        }
        const isProxy = property instanceof ProxyProperty;
        let previous;
        if (isProxy) {
          let localValue;
          if (this[key]) {
            this[key][ProperteaSet](value instanceof Concrete ? value[ToJSON]() : value);
            localValue = this[key];
          }
          else {
            localValue = pool.allocate(value, (proxy) => {
              proxy[Key] = key;
              proxy[ArraySymbol] = this;
            });
          }
          if (undefined !== value) {
            value = localValue;
          }
        }
        else {
          previous = this[key];
        }
        this[key] = value;
        if (!isProxy && previous !== value) {
          onDirtyCallback(parseInt(key), this);
        }
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
    ArrayProxy.prototype[SetWithDefaults] = function(value) {
      this[ProperteaSet](value);
    };
    ArrayProxy.prototype[ProperteaSet] = function(iterableOrDiff) {
      if (!iterableOrDiff || 'object' !== typeof iterableOrDiff) {
        return;
      }
      if (Symbol.iterator in iterableOrDiff) {
        this.setLength(0);
        let i = 0;
        for (const value of iterableOrDiff) {
          this.setAt(i++, value);
        }
      }
      else {
        for (const key in iterableOrDiff) {
          this.setAt(parseInt(key), iterableOrDiff[key]);
        }
      }
    };
    return ArrayProxy;
  }

  map(views = {}) {
    return this.concrete(views);
  }

}
