import { CrunchesArray, CrunchesMap, CrunchesOptional, CrunchesType, CrunchesVarInt, type Target } from 'crunches'

import { Pool } from './pool.js';
import { Propertea } from './propertea.ts'
import {
  Diff,
  Initialize,
  MarkClean,
  type ProxyCreatorConcreteConfiguration,
  type ProxyMixedCreator,
  ProxyProperty,
  Set as ProperteaSet,
  ToJSON,
  ToJSONWithoutDefaults,
  type ProxyDecorator,
  type ProxyMixed,
} from './proxy.js';
import { type DeepPartial } from './internal-types.ts';

const ArraySymbol = Symbol('Propertea.array.Array');
const Key = Symbol('Propertea.array.Index');

const nop = () => {};

interface ArrayProxyInterface<T, Stored = T> {

  dirty: Set<number> | undefined
  pool: any

  [Diff](): Map<number, T | undefined> | undefined
  [MarkClean](): void
  [ProperteaSet](value: Map<number, T | undefined>): void
  [Initialize](value?: Iterable<T>): void
  [ToJSON](): T[]
  [ToJSONWithoutDefaults](defaults?: any): T[] | undefined

  at(key: number): Stored | undefined
  setAt(key: number, value: T | undefined): void
  setLength(length: number): void

}

export class ProperteaArrayCodec<
  E extends CrunchesType<unknown, unknown>
>
  extends CrunchesType<
    Array<E['_output'] | undefined> | Map<number, E['_output'] | undefined>,
    Iterable<E['_input'] | undefined> | Map<number, E['_input'] | undefined>
  >
{

  arrayCodec: CrunchesArray<E, true>
  mapCodec: CrunchesMap<CrunchesVarInt, E>

  constructor({ element }: { element: E }) {
    super()
    this.arrayCodec = new CrunchesArray({ element, sparse: true })
    this.mapCodec = new CrunchesMap({ key: new CrunchesVarInt(), value: element })
  }

  bigEndian(): this {
    this.arrayCodec.bigEndian()
    this.mapCodec.bigEndian()
    return super.bigEndian()
  }

  decodeFrom(view: DataView, target: Target): Array<E['_output'] | undefined> | Map<number, E['_output'] | undefined> {
    const isDiff = view.getUint8(target.byteOffset)
    target.byteOffset += 1
    if (isDiff) {
      return this.mapCodec.decodeFrom(view, target)
    }
    else {
      return this.arrayCodec.decodeFrom(view, target) as any
    }
  }

  encodeInto(value: (Iterable<E['_input'] | undefined>) | Map<number, E['_input'] | undefined>, view: DataView, byteOffset: number): number {
    let written = 0
    const isDiff = value instanceof Map
    view.setUint8(byteOffset + written, isDiff ? 1 : 0)
    written += 1
    if (isDiff) {
      written += this.mapCodec.encodeInto(value, view, byteOffset + written)
    }
    else {
      written += this.arrayCodec.encodeInto(value as any, view, byteOffset + written)
    }
    return written
  }

  littleEndian(): this {
    this.arrayCodec.littleEndian()
    this.mapCodec.littleEndian()
    return super.littleEndian()
  }

  sizeOf(value: (Iterable<E['_input'] | undefined>) | Map<number, E['_input'] | undefined>, byteOffset: number) {
    let size = 0
    size += 1
    if (value instanceof Map) {
      size += this.mapCodec.sizeOf(value, byteOffset + size)
    }
    else {
      size += this.arrayCodec.sizeOf(value as any, byteOffset + size)
    }
    return size
  }

}

export class ProperteaArray<
  Element extends Propertea<unknown>,
  Extension extends object = {},
  Stored = Element extends ProxyProperty<any> ? ProxyMixed<Element['_T']> : Element['_T'],
>
  extends ProxyProperty<
    ArrayProxyInterface<Element['_T'], Stored>,
    Extension,
    Iterable<Element['_T']> | undefined
  >
{

  codec: CrunchesOptional<ProperteaArrayCodec<Element['codec']['inner']>>
  decorate: ProxyDecorator<ArrayProxyInterface<Element['_T'], Stored>, Extension> | undefined
  element: Element

  constructor(
    { element }: { element: Element },
    decorate?: ProxyDecorator<ArrayProxyInterface<Element['_T'], Stored>, Extension>,
  ) {
    super();
    this.decorate = decorate
    this.element = element
    this.codec = new ProperteaArrayCodec({ element: element.codec.inner }).optional()
  }

  concrete(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {
    const { defaultValue, element } = this;
    const { dirtyByteWidth } = element;
    const onDirtyCallback = configuration.onDirty ?? nop;

    class ArrayProxy {

      $$array: Element['_T'][] = []

      constructor() {
        this.dirty = new Set<number>();
        this[Initialize](defaultValue);
      }

      [ProperteaSet](value: Map<number, Element['_T'] | undefined>): void {
        for (const [k, v] of value) {
          this.setAt(k, v)
        }
      }

      [Initialize](value?: Iterable<Element['_T']>): void {
        this.setLength(0);
        if (value) {
          let i = 0;
          for (const elm of value) {
            this.setAt(i++, elm);
          }
        }
      }

      [ToJSONWithoutDefaults](_defaults?: any): Element['_T'][] | undefined {
        return this[ToJSON]()
      }

      at(key: number) {
        return this.$$array[key]
      }
    }

    interface ArrayProxy {
      [Diff](): Map<number, Element['_T'] | undefined> | undefined
      [MarkClean](): void
      [ToJSON](): Element['_T'][]
      dirty: Set<number> | undefined
      pool: any
      setAt(key: number, value: Element['_T'] | undefined): void
      setLength(length: number): void
    }

    if (element instanceof ProxyProperty) {
      const Concrete = class extends element.concrete(configuration, isRoot) {
        [Key]: number | undefined = undefined;
        [ArraySymbol]: ArrayProxy | undefined = undefined;
      }
      const pool = new Pool(
        element,
        {
          onDirty: (bit, proxy) => {
            onDirtyCallback(bit, proxy);
            const index = Math.floor(bit / dirtyByteWidth);
            if (index < pool.length.value) {
              const proxy = pool.proxies[index] as any
              if (proxy) {
                proxy[ArraySymbol].dirty.add(proxy[Key]);
              }
            }
          },
        },
      );
      ArrayProxy.prototype.pool = pool
      ArrayProxy.prototype.setAt = function(key: number, value: DeepPartial<Element['_T']> | undefined) {
        if (undefined === value && key in this.$$array) {
          pool.free(this.$$array[key]);
        }
        this.dirty?.add(key);
        let localValue;
        if (this.$$array[key]) {
          (this.$$array[key] as typeof element['_T'])[ProperteaSet](
            value instanceof Concrete
              ? (value as typeof element['_T'])[ToJSON]()
              : value
          );
          localValue = this.$$array[key];
        }
        else {
          localValue = pool.allocate(value, (proxy: any) => {
            proxy[Key] = key;
            proxy[ArraySymbol] = this;
          });
        }
        if (undefined !== value) {
          value = localValue;
        }
        this.$$array[key] = value;
      }
      ArrayProxy.prototype.setLength = function(length: number) {
        for (let i = this.$$array.length - 1; i >= length; --i) {
          pool.free(this.$$array[i]);
          this.dirty?.add(i);
        }
        this.$$array.length = length;
      }
      ArrayProxy.prototype[Diff] = function(): Map<number, Element['_T'] | undefined> {
        const entries: Map<number, Element['_T'] | undefined> = new Map()
        for (const dirty of this.dirty!) {
          const v = this.$$array[dirty];
          entries.set(dirty, undefined === v ? undefined : v[Diff]())
        }
        return entries
      };
      ArrayProxy.prototype[MarkClean] = function() {
        this.dirty!.clear();
        for (const value of this.$$array) {
          value[MarkClean]();
        }
      };
      ArrayProxy.prototype[ToJSON] = function(): Element['_T'][] {
        const json = [];
        for (const value of this.$$array) {
          json.push((value as typeof element['_T'])[ToJSON]());
        }
        return json;
      }
    }
    else {
      ArrayProxy.prototype.setLength = function(length: number) {
        for (let i = this.$$array.length - 1; i >= length; --i) {
          this.dirty?.add(i);
        }
        this.$$array.length = length;
      }
      ArrayProxy.prototype.setAt = function(key: number, value: Element['_T'] | undefined) {
        this.dirty?.add(key);
        const previous = this.$$array[key];
        this.$$array[key] = value;
        if (previous !== value) {
          onDirtyCallback(key, this);
        }
      }
      ArrayProxy.prototype[Diff] = function(): Map<number, Element['_T'] | number> {
        const entries: Map<number, Element['_T'] | undefined> = new Map()
        for (const dirty of this.dirty!) {
          entries.set(dirty, this.$$array[dirty])
        }
        return entries
      };
      ArrayProxy.prototype[MarkClean] = function() {
        this.dirty!.clear();
      };
      ArrayProxy.prototype[ToJSON] = function(): Element['_T'][] {
        const json = [];
        for (const value of this.$$array) {
          json.push(value);
        }
        return json;
      }
    }
    return (
      this.decorate
        ? this.decorate(ArrayProxy as unknown as new (index: number) => ArrayProxyInterface<Element['_T'], Stored>)
        : ArrayProxy
      ) as ProxyMixedCreator<
        ArrayProxyInterface<Element['_T'], Stored> & Extension
      >
  }

  mapped(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

}

export function array<
  P extends Propertea<unknown>,
  E extends object = {},
  Stored = P extends ProxyProperty<any> ? ProxyMixed<P['_T']> : P['_T'],
>(
  options: { element: P; length?: number },
  decorate?: ProxyDecorator<ArrayProxyInterface<P['_T'], Stored>, E>,
) {
  return new ProperteaArray(options, decorate)
}
