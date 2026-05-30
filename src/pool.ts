import { type DeepPartial } from './internal-types.ts';
import {
  MarkClean,
  ProxyProperty,
  SetWithDefaults,
  type ProxyMixed,
  type ProxyMixedCreator,
  type ProxyCreatorConfiguration,
  type ProxyOnDirtyCallback,
} from './proxy.ts';

export const Index = Symbol('Index');

type PoolProxyMixed<Prop extends ProxyProperty<any>, HasDirty extends boolean> = (
  ProxyMixed<Prop['_T'], HasDirty> & { [Index]: number }
)

type PoolViews<HasDirty extends boolean> = (
  ProxyCreatorConfiguration
  & (HasDirty extends true ? { dirty: Uint8Array } : {})
)

export class Pool<
  Prop extends ProxyProperty<any>,
  HasDirty extends boolean = true,
> {

  data = {
    memory: new WebAssembly.Memory({initial: 0}),
    nextGrow: 0,
  };

  dirty = {
    memory: new WebAssembly.Memory({initial: 0}),
    nextGrow: 0,
  };

  freeList: (PoolProxyMixed<Prop, HasDirty>)[] = [];

  length = new WebAssembly.Global({mutable: true, value: 'i32'}, 0);

  property: Prop

  proxies: (PoolProxyMixed<Prop, HasDirty> | null)[] = [];

  views: PoolViews<HasDirty> = {
    data: new DataView(new ArrayBuffer(0)),
    dirty: undefined as any,
  };

  ProxyCreator: ProxyMixedCreator<(Prop['_T']), HasDirty>

  constructor(
    property: Prop,
    params?: {
      onDirty?: HasDirty extends true ? true | ProxyOnDirtyCallback : HasDirty
    }
  ) {
    if (!(property instanceof ProxyProperty)) {
      throw new TypeError(`Propertea(pool): not a proxy property`);
    }
    this.property = property;
    const {onDirty = true} = params ?? {};
    if (onDirty) {
      this.views.dirty = new Uint8Array(0);
      this.views.onDirty = onDirty;
    }
    const method = property.isMappable ? 'mapped' : 'concrete'
    this.ProxyCreator = class extends property[method](this.views, true) {
      [Index]: number
      constructor(index: number) {
        super(index);
        this[Index] = index;
      }
    } as unknown as ProxyMixedCreator<Prop['_T'], HasDirty>
  }

  allocate<E extends object = {}>(
    value?: DeepPartial<Prop['_T']>,
    initialize?: (_: PoolProxyMixed<Prop, HasDirty> & E) => void,
  ): PoolProxyMixed<Prop, HasDirty> & E {
    let proxy: (ProxyMixed<Prop['_T'], HasDirty> & { [Index]: number });
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
      if (this.views.onDirty && length === dirty.nextGrow) {
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
    proxy[SetWithDefaults](value);
    return proxy;
  }

  wasmImports() {
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

  free(proxy: (ProxyMixed<Prop['_T'], HasDirty> & { [Index]: number })) {
    proxy[MarkClean as any]?.();
    this.freeList.push(proxy);
    this.proxies[proxy[Index]] = null;
  }

}
