import { Codecs } from 'crunches';

import { Pool } from './pool.js';
import { Diff, MarkClean, ProxyProperty, Set as ProperteaSet, SetWithDefaults, ToJSON } from './proxy.js';
import { registry } from './register.js';

const Key = Symbol('Index');
const ArraySymbol = Symbol('ArraySymbol');

const nop = () => {};

/**
 * A class representing an array property in the ProxyProperty system.
 */
registry.array = class ArrayProxyProperty extends ProxyProperty {

  /**
   * Constructor for the ArrayProxyProperty class.
   *
   * @param {Object} blueprint - The crunches blueprint.
   */
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

  /**
   * Generates a concrete proxy class for the array property.
   *
   * @param {Object} [views={}] - An optional object containing views to be applied to the generated proxy class.
   * @returns {Class} The generated concrete proxy class.
   */
  concrete(views = {}) {
    const {blueprint} = this;
    const Proxy = this.generateProxy(views);
    return (blueprint.Proxy ?? ((C) => C))(Proxy);
  }

  /**
   * Generates a proxy class for the array property based on the provided views.
   *
   * @param {Object} views - An object containing views to be applied to the generated proxy class.
   * @returns {Class} The generated proxy class.
   */
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

    /**
     * A class representing an array proxy.
     */
    class ArrayProxy extends Array {

      /**
       * Constructor for the ArrayProxy class.
       *
       * @param {Object} [views={}] - An optional object containing views to be applied to the generated proxy class.
       */
      constructor() {
        super();
        this.pool = pool;
        this[ProperteaSet](blueprint.defaultValue);
      }

      /**
       * A set of indices that have been marked as dirty.
       */
      dirty = new Set();

      /**
       * Sets the length of the array.
       *
       * @param {number} length - The new length of the array.
       */
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

      /**
       * Sets a value at the specified index.
       *
       * @param {number} key - The index at which to set the value.
       * @param {*} value - The new value.
       */
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

      /**
       * Returns a JSON representation of the array.
       *
       * @returns {Array<any>} A JSON object representing the array.
       */
      [ToJSON]() {
        const json = [];
        for (const value of this) {
          json.push(property instanceof ProxyProperty ? value[ToJSON]() : value);
        }
        return json;
      }
    }

    /**
     * If the onDirty view is enabled, adds dirty API functionality to the array proxy class.
     */
    if (views.onDirty ?? true) {

      /**
       * Calculates and returns the differences since the last clean operation.
       *
       * @returns {Object} An object containing the differences.
       */
      ArrayProxy.prototype[Diff] = function() {
        const entries = {};
        if (property instanceof ProxyProperty) {
          for (const dirty of this.dirty) {
            const v = this[dirty];
            // If the value is a proxy property, recursively generate its diff.
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

      /**
       * Marks the array as clean.
       */
      ArrayProxy.prototype[MarkClean] = function() {
        this.dirty.clear();
        if (property instanceof ProxyProperty) {
          for (const value of this) {
            value[MarkClean]();
          }
        }
      };
    }

    /**
    * Sets the array with default values.
    *
    * @param {*} iterableOrDiff - The new value for the array.
    */
    ArrayProxy.prototype[SetWithDefaults] = function(value) {
      this[ProperteaSet](value);
    };

    /**
     * Sets the array to a new value.
     *
     * @param {Object} iterableOrDiff - The new value for the array.
     */
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

  /**
   * Returns the mapped ArrayProxy class.
   *
   * @param {Object} [views={}] - An optional object containing views to be applied to the generated proxy class.
   * @returns {Class} The mapped ArrayProxy class.
   */
  map(views = {}) {
    return this.concrete(views);
  }

}
