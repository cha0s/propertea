import { type DeepPartial } from './internal-types.ts'
import { Memory, type TrackedMemory } from './memory.ts'
import {
  Initialize,
  MarkClean,
  ProxyPropertea,
  type ProxyMixed,
  type ProxyConstructorMixed,
  type ProxyOnDirtyCallback,
} from './proxy.ts'

export const Index = Symbol('Index')
const Owner = Symbol('Pool.owner')

type PoolOwned = { [Owner]: Pool<ProxyPropertea<any>> }

/**
 * Proxy property with pool index mixed in.
 */
type PoolProxyMixed<Prop extends ProxyPropertea<any>> = (
  ProxyMixed<Prop['_T']> & { [Index]: number }
)

type PoolViews = {
  /**
   * Data buffer.
   */
  data: DataView
  /**
   * Dirty buffer.
   */
  dirty: Uint8Array
  /**
   * Dirty notification callback.
   */
  onDirty?: ProxyOnDirtyCallback
}

/**
 * A pool of proxy Propertea objects.
 */
export class Pool<
  Prop extends ProxyPropertea<any>,
  UseWasm extends boolean = false,
> {

  /**
   * Data memory.
   */
  data: TrackedMemory<UseWasm>

  /**
   * Dirty memory.
   */
  dirty: TrackedMemory<UseWasm>

  /**
   * List of proxies that have been freed.
   */
  freeList: (PoolProxyMixed<Prop>)[] = []

  /**
   * Total count of all allocations in this pool so far.
   */
  length = new WebAssembly.Global({ mutable: true, value: 'i32' }, 0)

  /**
   * The Propertea used to configure and create proxies.
   */
  property: Prop

  /**
   * The active proxies in this pool.
   */
  proxies: (PoolProxyMixed<Prop> | null)[] = []

  views: PoolViews = {
    /**
     * Data buffer.
     */
    data: new DataView(new ArrayBuffer(0)),
    /**
     * Dirty buffer.
     */
    dirty: new Uint8Array(1),
  }

  /**
   * (Class) constructor function used to instantiate new proxies.
   */
  ProxyConstructor: ProxyConstructorMixed<Prop['_T'] & Prop['_E']>

  /**
   *
   * @param property The Propertea used to configure and create proxies.
   * @param params Dirty notification callback and WASM configuration.
   */
  constructor(
    property: Prop,
    params?: {
      onDirty?: ProxyOnDirtyCallback
      useWasm?: UseWasm
    }
  ) {
    if (!(property instanceof ProxyPropertea)) {
      throw new TypeError(`Propertea(pool): not a proxy property`)
    }
    const { useWasm = false, onDirty } = params ?? {}
    this.property = property
    const { dirtyBitWidth } = property
    this.views.onDirty = (bit) => {
      onDirty?.(bit)
    }
    this.data = {
      memory: useWasm ? new WebAssembly.Memory({ initial: 0 }) : new Memory() as any,
      nextGrow: 0,
    }
    this.dirty = {
      memory: useWasm ? new WebAssembly.Memory({ initial: 0 }) : new Memory() as any,
      nextGrow: 0,
    }
    // Size the initial dirty view to the property's full bit span; `allocate` grows
    // it (and re-points `views.dirty`) before creating further instances.
    this.views.dirty = new Uint8Array(Math.ceil(dirtyBitWidth / 8))
    const method = property.isMappable ? 'mapped' : 'concrete'
    const owner = this
    this.ProxyConstructor = class extends property[method](this.views, true) {
      ;[Index]: number
      ;[Owner]: typeof owner
      constructor(index: number) {
        super(index)
        this[Index] = index
        this[Owner] = owner
      }
    } as unknown as ProxyConstructorMixed<Prop['_T'] & Prop['_E']>
  }

  /**
   * Allocate a new proxy by pulling from the pool or instantiating.
   * @param value Default value used to initialize the proxy.
   * @returns The proxy.
   */
  allocate(value?: DeepPartial<Prop['_T']>): PoolProxyMixed<Prop> & Prop['_E']
  /**
   * Allocate a new proxy and run an initializer on it before it is filled with
   * its default value. `initialize` may attach extra fields to the instance;
   * declare them via the `E` type parameter so the returned proxy is typed
   * with them.
   * @param value Default value used to initialize the proxy.
   * @param initialize Initializer run before the proxy's `[Initialize]`.
   * @returns The proxy, augmented with the fields set by `initialize`.
   */
  allocate<E extends object>(
    value: DeepPartial<Prop['_T']> | undefined,
    initialize: (_: PoolProxyMixed<Prop> & E) => void,
  ): PoolProxyMixed<Prop> & Prop['_E'] & E
  allocate<E extends object = {}>(
    value?: DeepPartial<Prop['_T']>,
    initialize?: (_: PoolProxyMixed<Prop> & E) => void,
  ): PoolProxyMixed<Prop> & Prop['_E'] & E {
    let proxy: (ProxyMixed<Prop['_T']> & { [Index]: number })
    // free instance? use it
    if (this.freeList.length > 0) {
      proxy = this.freeList.pop()!
    }
    else {
      const { data, dirty, views } = this
      const { length } = this.proxies
      // allocate more data buffer if we need it
      if (this.property.isMappable && length === data.nextGrow) {
        data.memory.grow(1)
        views.data = new DataView(data.memory.buffer)
        data.nextGrow = Math.floor(data.memory.buffer.byteLength / this.property.byteWidth)
      }
      // allocate more dirty buffer if we need it
      if (length === dirty.nextGrow) {
        dirty.memory.grow(1)
        views.dirty = new Uint8Array(dirty.memory.buffer)
        dirty.nextGrow = Math.floor(
          dirty.memory.buffer.byteLength / (this.property.dirtyBitWidth / 8),
        )
      }
      // allocate a new proxy
      proxy = new this.ProxyConstructor(length)
      this.length.value += 1
    }
    // set and initialize
    this.proxies[proxy[Index]] = proxy
    initialize?.(proxy)
    proxy[Initialize](value)
    return proxy
  }

  /**
   * Get the WASM imports for this pool.
   */
  wasmImports() {
    return {
      byte_width: new WebAssembly.Global({ value: 'i32' }, this.property.byteWidth),
      data: this.data.memory,
      dirty: this.dirty.memory,
      dirty_byte_width: new WebAssembly.Global({ value: 'i32' }, this.property.dirtyBitWidth),
      length: this.length,
    }
  }

  /**
   * Marks all instances in the pool as clean.
   */
  markClean() {
    new Uint8Array(this.dirty.memory.buffer).fill(0)
    this.ProxyConstructor.markClean?.()
    for (const proxy of this.proxies) {
      if (proxy) {
        proxy[MarkClean]?.()
      }
    }
  }

  /**
   * Free a proxy.
   * @param proxy The proxy to free.
   */
  free(proxy: (ProxyMixed<Prop['_T']>)) {
    // no double free, please
    if (this !== (proxy as unknown as PoolOwned)[Owner]) {
      throw new TypeError('Propertea(pool): proxy does not belong to this pool')
    }
    if (null === this.proxies[proxy[Index]]) {
      return
    }
    proxy[MarkClean]?.()
    this.freeList.push(proxy)
    this.proxies[proxy[Index]] = null
  }

}
