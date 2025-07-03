import {Initialize} from './proxy.js';
import {registry} from './register.js';

export const Index = Symbol('Index');

export class Pool {

  data = {
    memory: new WebAssembly.Memory({initial: 0}),
    nextGrow: 0,
    width: 0,
  };
  dirty = {
    memory: new WebAssembly.Memory({initial: 0}),
    nextGrow: 0,
    width: 0,
  };
  freeList = [];
  length = new WebAssembly.Global({mutable: true, value: 'i32'}, 0);
  proxies = [];
  views = {
    data: new DataView(new ArrayBuffer(0)),
    dirty: null,
  };

  constructor(blueprint, params = {}) {
    this.blueprint = blueprint;
    if (!registry[blueprint.type]) {
      throw new TypeError(`Propertea: '${blueprint.type}' not registered`);
    }
    const property = new registry[blueprint.type](blueprint);
    const {onDirty = true} = params;
    if (onDirty) {
      this.dirty.width = property.dirtyWidth;
      this.views.dirty = new Uint8Array(0);
      this.views.onDirty = onDirty;
    }
    // mapped or concrete instance based on data width
    this.data.width = property.dataWidth;
    this.Proxy = class extends property[this.data.width > 0 ? 'map' : 'concrete'](this.views) {
      constructor(index) {
        super(index);
        this[Index] = index;
      }
    };
    this.property = property;
  }

  allocate(values, initialize) {
    let proxy;
    // free instance? use it
    if (this.freeList.length > 0) {
      proxy = this.freeList.pop();
    }
    else {
      const {data, dirty, views} = this;
      const {length} = this.proxies;
      // allocate more data buffer if we need it
      if (this.data.width > 0) {
        if (length === data.nextGrow) {
          data.memory.grow(1);
          views.data = new DataView(data.memory.buffer);
          data.nextGrow = Math.floor(data.memory.buffer.byteLength / this.data.width);
        }
      }
      // allocate more dirty buffer if we need it
      if (this.views.onDirty && length === dirty.nextGrow) {
        dirty.memory.grow(1);
        views.dirty = new Uint8Array(dirty.memory.buffer);
        dirty.nextGrow = Math.floor(dirty.memory.buffer.byteLength / (this.dirty.width / 8));
      }
      // allocate a new proxy
      proxy = new this.Proxy(length);
      this.length.value += 1;
    }
    // set and initialize
    this.proxies[proxy[Index]] = proxy;
    initialize?.(proxy);
    proxy[Initialize](values);
    return proxy;
  }

  imports() {
    return {
      data: this.data.memory,
      dirty: this.dirty.memory,
      length: this.length,
    }
  }

  markClean() {
    new Uint8Array(this.dirty.memory.buffer).fill(0);
  }

  free(proxy) {
    this.freeList.push(proxy);
    this.proxies[proxy[Index]] = null;
  }

}
