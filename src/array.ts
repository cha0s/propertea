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

interface ArrayProxyInterface<Element extends Propertea<unknown>, Stored = Element['_T']> {

  dirty: Set<number> | undefined
  pool: any

  [Diff](): ProperteaArrayDiff<Element['codec']['inner']> | undefined
  [MarkClean](): void
  [ProperteaSet](value: ProperteaArrayDiff<Element['codec']['inner']>): void
  [Initialize](value?: Iterable<Element['_T']>): void
  [ToJSON](): Element['_T'][]
  [ToJSONWithoutDefaults](defaults?: any): Element['_T'][] | undefined

  [Symbol.iterator](): Iterator<Element['_T']>

  at(key: number): Stored | undefined
  get length(): number
  includes(value: Element['_T']): boolean
  setAt(key: number, value: Element['_T'] | undefined): void
  setLength(length: number): void

}

type ProperteaArrayDiff<
  E extends CrunchesType<unknown, unknown>
> = Record<number, E['_output'] | E['_input'] | undefined>

export class ProperteaArrayCodec<
  E extends CrunchesType<unknown, unknown>
>
  extends CrunchesType<
    Array<E['_output'] | undefined> | ProperteaArrayDiff<E>,
    Iterable<E['_input'] | undefined> | Map<number, E['_input'] | undefined>
  >
{

  arrayCodec: CrunchesArray<E, true>
  mapCodec: CrunchesMap<CrunchesVarInt, E, true>

  constructor({ element }: { element: E }) {
    super()
    this.arrayCodec = new CrunchesArray({ element, sparse: true })
    this.mapCodec = new CrunchesMap({ key: new CrunchesVarInt(), value: element, sparse: true })
  }

  bigEndian(): this {
    this.arrayCodec.bigEndian()
    this.mapCodec.bigEndian()
    return super.bigEndian()
  }

  decodeFrom(view: DataView, target: Target): Array<E['_output'] | undefined> | ProperteaArrayDiff<E> {
    const isDiff = view.getUint8(target.byteOffset)
    target.byteOffset += 1
    if (isDiff) {
      const map = this.mapCodec.decodeFrom(view, target)
      const diff: ProperteaArrayDiff<E> = {}
      for (const [key, value] of map) {
        diff[key] = value
      }
      return diff
    }
    else {
      return this.arrayCodec.decodeFrom(view, target) as any
    }
  }

  encodeInto(value: (Iterable<E['_input'] | undefined>) | ProperteaArrayDiff<E>, view: DataView, byteOffset: number): number {
    let written = 0
    const isDiff = !(Symbol.iterator in value)
    view.setUint8(byteOffset + written, isDiff ? 1 : 0)
    written += 1
    if (isDiff) {
      const diff: [number, E['_input'] | undefined][] = []
      for (const key in value) {
        diff.push([Number(key), value[key]])
      }
      written += this.mapCodec.encodeInto(diff, view, byteOffset + written)
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

  sizeOf(value: (Iterable<E['_input'] | undefined>) | ProperteaArrayDiff<E>, byteOffset: number) {
    let size = 0
    size += 1
    const isDiff = !(Symbol.iterator in value)
    if (isDiff) {
      const diff: [number, E['_input'] | undefined][] = []
      for (const key in value) {
        diff.push([Number(key), value[key]])
      }
      size += this.mapCodec.sizeOf(diff, byteOffset + size)
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
    ArrayProxyInterface<Element, Stored>,
    Extension,
    Iterable<Element['_T']> | undefined
  >
{

  codec: CrunchesOptional<ProperteaArrayCodec<Element['codec']['inner']>>
  decorate: ProxyDecorator<ArrayProxyInterface<Element, Stored>, Extension> | undefined
  element: Element

  constructor(
    { element }: { element: Element },
    decorate?: ProxyDecorator<ArrayProxyInterface<Element, Stored>, Extension>,
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

      [ProperteaSet](value: ProperteaArrayDiff<Element['codec']['inner']>): void {
        if (value) {
          for (const k in value) {
            this.setAt(Number(k), value[k])
          }
        }
      }

      [Initialize](value?: Iterable<Element['_T']> | ProperteaArrayDiff<Element['codec']['inner']>): void {
        this.setLength(0);
        if (value) {
          if (Symbol.iterator in value) {
            let i = 0;
            for (const elm of value) {
              this.setAt(i++, elm);
            }
          }
          else {
            this[ProperteaSet](value)
          }
        }
      }

      [ToJSONWithoutDefaults](_defaults?: any): Element['_T'][] | undefined {
        return this[ToJSON]()
      }

      [Symbol.iterator]() {
        return this.$$array.values()
      }

      at(key: number) {
        return this.$$array[key]
      }

      includes(value: Element['_T']) {
        return this.$$array.includes(value)
      }

      get length() {
        return this.$$array.length
      }

    }

    interface ArrayProxy {
      [Diff](): ProperteaArrayDiff<Element['codec']['inner']> | undefined
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
      ArrayProxy.prototype[Diff] = function(): ProperteaArrayDiff<Element['codec']['inner']> {
        const diff: ProperteaArrayDiff<Element['codec']['inner']> = {}
        for (const dirty of this.dirty!) {
          const v = this.$$array[dirty];
          diff[dirty] = undefined === v ? undefined : v[Diff]()
        }
        return diff
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
      ArrayProxy.prototype[Diff] = function(): ProperteaArrayDiff<Element['codec']['inner']> {
        const diff: ProperteaArrayDiff<Element['codec']['inner']> = {}
        for (const dirty of this.dirty!) {
          diff[dirty] = this.$$array[dirty]
        }
        return diff
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
        ? this.decorate(ArrayProxy as unknown as new (index: number) => ArrayProxyInterface<Element, Stored>)
        : ArrayProxy
      ) as ProxyMixedCreator<
        ArrayProxyInterface<Element, Stored> & Extension
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
  decorate?: ProxyDecorator<ArrayProxyInterface<P, Stored>, E>,
) {
  return new ProperteaArray(options, decorate)
}
