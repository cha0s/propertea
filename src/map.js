import { Codecs } from 'crunches';

import { Pool } from './pool.js';
import { Diff, MarkClean, ProxyProperty, Set as ProperteaSet, SetWithDefaults, ToJSON } from './proxy.js';
import { registry } from './register.js';

const Key = Symbol('Index');
const MapSymbol = Symbol('MapSymbol');

/**
 * A class that represents a map proxy property.
 */
registry.map = class MapProxyProperty extends ProxyProperty {

  /**
   * Constructor for the MapProxyProperty class.
   *
   * @param blueprint The crunches blueprint
   */
  constructor(blueprint) {
    super(blueprint);
    if (!registry[blueprint.value.type]) {
      throw new TypeError(`Propertea(map): value type '${blueprint.value.type}' not registered`);
    }
    this.property = new registry[blueprint.value.type](blueprint.value);
    this.codec = new Codecs.map(blueprint);
  }

  /**
   * Creates a concrete map proxy class based on the provided views.
   *
   * @param views Optional object containing view-specific configuration values.
   * @returns The concrete map proxy class.
   */
  concrete(views = {}) {
    const {blueprint} = this;
    const Proxy = this.generateProxy(views);
    return (blueprint.Proxy ?? ((C) => C))(Proxy);
  }

  /**
   * Generates a map proxy class based on the provided views.
   *
   * @param views Optional object containing view-specific configuration values.
   * @returns The generated map proxy class.
   */
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

    /**
     * A class that represents a map proxy with JSON API functionality.
     */
    class MapProxy extends Map {

      /**
       * A set of keys in the map that have been modified since the last clean operation.
       *
       * @type {Set<number>}
       */
      dirty = new Set();

      /**
       * Creates a new instance of the map proxy.
       */
      constructor() {
        super();
        this[ProperteaSet](blueprint.defaultValue);
      }

      /**
       * Removes all key-value pairs from the map.
       *
       * @returns {void}
       */
      clear() {
        for (const entry of this) {
          this.delete(entry[0]);
        }
      }

      /**
       * Removes a key-value pair from the map.
       *
       * @param {any} key The key to remove
       * @returns {boolean} Whether the key was removed
       */
      delete(key) {
        if (this.has(key)) {
          pool.free(this.get(key));
        }
        super.delete(key);
        this.dirty.add(key);
      }

      /**
       * Sets a new value for a given key.
       *
       * @param {any} key The key to set
       * @param {*} value The new value to set
       * @returns {void}
       */
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

      /**
       * Returns a JSON representation of the map.
       *
       * @returns {Array<Array<any>>} A JSON array representing the key-value pairs
       */
      [ToJSON]() {
        const json = [];
        for (const entry of this) {
          json.push([entry[0], property instanceof ProxyProperty ? entry[1][ToJSON]() : entry[1]]);
        }
        return json;
      }
    }
    /**
     * If the onDirty view is enabled, adds dirty API functionality to the map proxy class.
     */
    if (views.onDirty ?? true) {
      /**
       * Calculates and returns the differences since the last clean operation.
       *
       * @returns {Array<Array<any>>} An array of modified key-value pairs
       */
      MapProxy.prototype[Diff] = function() {
        const entries = [];
        if (property instanceof ProxyProperty) {
          for (const dirty of this.dirty) {
            const v = this.get(dirty);
            // If the value is a proxy property, recursively generate its diff.
            entries.push([dirty, undefined === v ? undefined : v[Diff]()]);
          }
        }
        else {
          for (const dirty of this.dirty) {
            entries.push([dirty, this.get(dirty)]);
          }
        }
        return entries;
      };
      /**
       * Marks the map as clean.
       *
       * @returns {void}
       */
      MapProxy.prototype[MarkClean] = function() {
        this.dirty.clear();
        if (property instanceof ProxyProperty) {
          for (const entry of this) {
            entry[1][MarkClean]();
          }
        }
      };
    }

    /**
     * Sets the map proxy with default values.
     */
    MapProxy.prototype[SetWithDefaults] = function() {};
    /**
     * Sets the map proxy class with provided entries.
     *
     * @param entries An array of key-value pairs to set in the map proxy.
     */
    MapProxy.prototype[ProperteaSet] = function(entries) {
      if (!entries) {
        return;
      }
      this.clear();
      for (const entry of entries) {
        this.set(entry[0], entry[1]);
      }
    };
    /**
     * Returns the generated map proxy class.
     */
    return MapProxy;
  }

  /**
   * Creates a concrete map proxy class based on the provided views.
   *
   * @param views Optional object containing view-specific configuration values.
   * @returns The concrete map proxy class.
   */
  map(views = {}) {
    return this.concrete(views);
  }
};
