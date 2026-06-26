import { type DeepPartial } from './internal-types.ts';
import { Memory, type TrackedMemory } from './memory.ts';
import {
  Initialize,
  MarkClean,
  ProxyProperty,
  type ProxyMixed,
  type ProxyMixedCreator,
  type ProxyOnDirtyCallback,
} from './proxy.ts';

export const Index = Symbol('Index');

type PoolProxyMixed<Prop extends ProxyProperty<any>> = (
  ProxyMixed<Prop['_T']> & { [Index]: number }
)

type PoolViews = {
  data: DataView
  dirty: Uint8Array
  onDirty?: ProxyOnDirtyCallback
}

export class Pool<
  Prop extends ProxyProperty<any>,
  UseWasm extends boolean = any,
> {

  data: TrackedMemory<UseWasm>

  dirty: TrackedMemory<UseWasm>

  freeList: (PoolProxyMixed<Prop>)[] = [];

  length = new WebAssembly.Global({mutable: true, value: 'i32'}, 0);

  property: Prop

  proxies: (PoolProxyMixed<Prop> | null)[] = [];

  views: PoolViews = {
    data: new DataView(new ArrayBuffer(0)),
    dirty: new Uint8Array(1),
  };

  ProxyCreator: ProxyMixedCreator<Prop['_T'] & Prop['_E']>

  constructor(
    property: Prop,
    params?: {
      onDirty?: ProxyOnDirtyCallback
      useWasm?: UseWasm
    }
  ) {
    if (!(property instanceof ProxyProperty)) {
      throw new TypeError(`Propertea(pool): not a proxy property`);
    }
    const { useWasm = false, onDirty } = params ?? {};
    this.property = property;
    const { dirtyByteWidth } = property
    this.views.onDirty = (bit) => {
      const index = Math.floor(bit / dirtyByteWidth)
      onDirty?.(bit, this.proxies[index])
    }
    this.data = {
      memory: useWasm ? new WebAssembly.Memory({ initial: 0 }) : new Memory() as any,
      nextGrow: 0,
    }
    this.dirty = {
      memory: useWasm ? new WebAssembly.Memory({ initial: 0 }) : new Memory() as any,
      nextGrow: 0,
    }
    const method = property.isMappable ? 'mapped' : 'concrete'
    this.ProxyCreator = class extends property[method](this.views, true) {
      [Index]: number
      constructor(index: number) {
        super(index);
        this[Index] = index;
      }
    } as unknown as ProxyMixedCreator<Prop['_T'] & Prop['_E']>
  }

  allocate<E extends object = {}>(
    value?: DeepPartial<Prop['_T']>,
    initialize?: (_: PoolProxyMixed<Prop> & E) => void,
  ): PoolProxyMixed<Prop> & Prop['_E'] & E {
    let proxy: (ProxyMixed<Prop['_T']> & { [Index]: number });
    // free instance? use it
    if (this.freeList.length > 0) {
      proxy = this.freeList.pop()!;
    }
    else {
      const {data, dirty, views} = this;
      const {length} = this.proxies;
      // allocate more data buffer if we need it
      if (this.property.isMappable && length === data.nextGrow) {
        data.memory.grow(1);
        views.data = new DataView(data.memory.buffer);
        data.nextGrow = Math.floor(data.memory.buffer.byteLength / this.property.byteWidth);
      }
      // allocate more dirty buffer if we need it
      if (length === dirty.nextGrow) {
        dirty.memory.grow(1);
        views.dirty = new Uint8Array(dirty.memory.buffer);
        dirty.nextGrow = Math.floor(
          dirty.memory.buffer.byteLength / (this.property.dirtyByteWidth / 8),
        );
      }
      // allocate a new proxy
      proxy = new this.ProxyCreator(length);
      this.length.value += 1;
    }
    // set and initialize
    this.proxies[proxy[Index]] = proxy;
    initialize?.(proxy);
    proxy[Initialize](value);
    return proxy;
  }

  wasmImports() {
    return {
      byte_width: new WebAssembly.Global({value: 'i32'}, this.property.byteWidth),
      data: this.data.memory,
      dirty: this.dirty.memory,
      dirty_byte_width: new WebAssembly.Global({value: 'i32'}, this.property.dirtyByteWidth),
      length: this.length,
    }
  }

  /**
   * Marks all instances in the pool as clean.
   */
  markClean() {
    new Uint8Array(this.dirty.memory.buffer).fill(0);
  }

  free(proxy: (ProxyMixed<Prop['_T']> & { [Index]: number })) {
    proxy[MarkClean]?.();
    this.freeList.push(proxy);
    this.proxies[proxy[Index]] = null;
  }

}
