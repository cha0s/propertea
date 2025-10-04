import { Instance, MarkClean, ProxyProperty, SetWithDefaults } from './proxy.js';
import { registry } from './register.js';

export const Index = Symbol('Index');

/**
 * A class representing a pool of instances.
 */
export class Pool {

  /**
   * The data memory.
   *
   * @type {memory: WebAssembly.Memory, nextGrow: Number}
   */
  data = {
    memory: new WebAssembly.Memory({initial: 0}),
    /**
     * The next grow size of the memory.
     */
    nextGrow: 0,
  };

  /**
   * The dirty memory.
   *
   * @type {memory: WebAssembly.Memory, nextGrow: Number}
   */
  dirty = {
    memory: new WebAssembly.Memory({initial: 0}),
    /**
     * The next grow size of the memory.
     */
    nextGrow: 0,
  };

  /**
   * A list of free instances in the pool.
   *
   * @type {Array<ProxyProperty>}
   */
  freeList = [];

  /**
   * The current length of the pool.
   *
   * @type {WebAssembly.Global}
   */
  length = new WebAssembly.Global({mutable: true, value: 'i32'}, 0);

  /**
   * A list of proxies for the instances in the pool.
   *
   * @type {Array<ProxyProperty>}
   */
  proxies = [];

  /**
   * The views for the data and dirty memory.
   *
   * @type {Object}
   */
  views = {
    /**
     * The view for the data memory.
     *
     * @type {DataView}
     */
    data: new DataView(new ArrayBuffer(0)),
    /**
     * The view for the dirty memory, or null if not used.
     *
     * @type {(Uint8Array|null)}
     */
    dirty: null,
  };

  /**
   * Constructs a new pool instance.
   *
   * @param {Object} blueprint - The crunches blueprint for the instances in the pool.
   * @param {Object} [params={}] - Additional parameters for the pool.
   */
  constructor(blueprint, params = {}) {
    this.blueprint = blueprint;
    if (!registry[blueprint.type]) {
      throw new TypeError(`Propertea(pool): blueprint type '${blueprint.type}' not registered`);
    }

    /**
     * A class representing a property of an instance in the pool.
     */
    class PoolProperty extends registry[blueprint.type] {
      /**
       * The instance symbol for the element.
       *
       * @type {Symbol}
       */
      [Instance] = Symbol('element');
    }
    const property = new PoolProperty(blueprint);
    if (!(property instanceof ProxyProperty)) {
      throw new TypeError(`Propertea(pool): blueprint type '${blueprint.type}' not a proxy type`);
    }
    const {onDirty = true} = params;
    if (onDirty) {
      this.views.dirty = new Uint8Array(0);
      this.views.onDirty = onDirty;
    }

    /**
     * A class representing a proxy for an instance in the pool.
     */
    this.Proxy = class extends property[property.dataWidth > 0 ? 'map' : 'concrete'](this.views) {
      /**
       * Constructs a new proxy instance.
       *
       * @param {number} index - The index of the instance.
       */
      constructor(index) {
        super(index);
        this[Index] = index;
      }
    };

    this.property = property;
  }

  /**
   * Allocates a new instance in the pool.
   *
   * @param {*} value - The initial value for the instance.
   * @param {Function} [initialize=null] - An optional function to initialize the instance.
   * @returns {ProxyProperty} The allocated proxy instance.
   */
  allocate(value, initialize) {
    let proxy;
    // free instance? use it
    if (this.freeList.length > 0) {
      proxy = this.freeList.pop();
    }
    else {
      const {data, dirty, views} = this;
      const {length} = this.proxies;
      // allocate more data buffer if we need it
      if (this.property.dataWidth > 0 && length === data.nextGrow) {
        data.memory.grow(1);
        views.data = new DataView(data.memory.buffer);
        data.nextGrow = Math.floor(data.memory.buffer.byteLength / this.property.dataWidth);
      }
      // allocate more dirty buffer if we need it
      if (this.views.onDirty && length === dirty.nextGrow) {
        dirty.memory.grow(1);
        views.dirty = new Uint8Array(dirty.memory.buffer);
        dirty.nextGrow = Math.floor(dirty.memory.buffer.byteLength / (this.property.dirtyWidth / 8));
      }
      // allocate a new proxy
      proxy = new this.Proxy(length);
      this.length.value += 1;
    }
    // set and initialize
    this.proxies[proxy[Index]] = proxy;
    initialize?.(proxy);
    proxy[SetWithDefaults](value);
    return proxy;
  }

  /**
   * Returns the imports for the pool.
   *
   * @returns {Object} The imports object.
   */
  imports() {
    return {
      data: this.data.memory,
      dirty: this.dirty.memory,
      length: this.length,
    }
  }

  /**
   * Marks all instances in the pool as clean.
   */
  markClean() {
    new Uint8Array(this.dirty.memory.buffer).fill(0);
  }

  /**
   * Frees a proxy instance from the pool.
   *
   * @param {ProxyProperty} proxy - The proxy instance to free.
   */
  free(proxy) {
    proxy[MarkClean]();
    this.freeList.push(proxy);
    this.proxies[proxy[Index]] = null;
  }

}
