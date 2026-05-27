import { array as crunchesArray } from 'crunches'

import { Pool } from './pool.js';
import {
  Diff,
  MarkClean,
  type ProxyCreatorConfiguration,
  type ProxyMixedCreator,
  ProxyProperty,
  Set as ProperteaSet,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
  type ProxyDecorator,
  type ProxyMixed,
  type HasDirty,
} from './proxy.js';
import { Property } from './types.ts'
import type { DeepPartial } from './internal-types.ts';

const Key = Symbol('Index');
const ArraySymbol = Symbol('ArraySymbol');

const nop = () => {};

type ArrayDiff<T> = Record<string, T>

interface ArrayProxyInterface<T, Stored = T> {
  dirty: Set<number> | undefined
  pool: any
  [ToJSON](): T[]
  [ToJSONWithoutDefaults](defaults?: any): T[] | undefined
  [ProperteaSet](value?: Iterable<T> | ArrayDiff<T>): void
  [SetWithDefaults](value?: Iterable<T> | ArrayDiff<T>): void
  at(key: number): Stored | undefined
  setAt(key: number, value: T | undefined): void
  setLength(length: number): void
}

export class ProperteaArray<
  Element extends Property<unknown>,
  Extension extends object = {},
  Stored = Element extends ProxyProperty<any> ? ProxyMixed<Element['_T'], true> : Element['_T'],
>
  extends ProxyProperty<
    ArrayProxyInterface<Element['_T'], Stored>,
    Extension
  >
{
  codec: ReturnType<typeof crunchesArray>
  decorate: ProxyDecorator<ArrayProxyInterface<Element['_T'], Stored>, Extension> | undefined
  element: Element

  constructor(
    { element, length = 0 }: { element: Element; length?: number },
    decorate?: ProxyDecorator<ArrayProxyInterface<Element['_T'], Stored>, Extension>,
  ) {
    super();
    this.decorate = decorate
    this.element = element
    this.codec = crunchesArray({ element: element.codec, length })
  }

  concrete<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
    const { defaultValue, element } = this;
    const { dirtyByteWidth } = element;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;

    class ArrayProxy {

      $$array: Element['_T'][] = []

      constructor() {
        if (onDirty) {
          this.dirty = new Set<number>();
        }
        this[ProperteaSet](defaultValue);
      }

      [ProperteaSet](value?: Iterable<Element['_T']> | ArrayDiff<Element['_T']>): void {
        if (!value || 'object' !== typeof value) {
          return;
        }
        if (Symbol.iterator in value) {
          this.setLength(0);
          let i = 0;
          for (const elm of value) {
            this.setAt(i++, elm);
          }
        }
        else {
          for (const key in value) {
            this.setAt(parseInt(key), value[key]);
          }
        }
      }

      [SetWithDefaults](value?: Iterable<Element['_T']> | ArrayDiff<Element['_T']>): void {
        this[ProperteaSet](value)
      }

      [ToJSONWithoutDefaults](_defaults?: any): Element['_T'][] | undefined {
        return this[ToJSON]()
      }

      at(key: number) {
        return this.$$array[key]
      }
    }

    interface ArrayProxy {
      [Diff](): Record<string, any> | undefined
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
        onDirty ? {
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
        } : undefined,
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
      if (onDirty) {
        ArrayProxy.prototype[Diff] = function() {
          const entries: Record<number, any> = {};
          for (const dirty of this.dirty!) {
            const v = this.$$array[dirty];
            // If the value is a proxy property, recursively generate its diff.
            entries[dirty] = undefined === v ? undefined : v[Diff]();
          }
          return entries;
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
      if (onDirty) {
        ArrayProxy.prototype[Diff] = function() {
          const entries: Record<number, any> = {};
          for (const dirty of this.dirty!) {
            entries[dirty] = this.$$array[dirty];
          }
          return entries;
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
    }
    return (
      this.decorate
        ? this.decorate(ArrayProxy as unknown as new (index: number) => ArrayProxyInterface<Element['_T'], Stored>)
        : ArrayProxy
      ) as ProxyMixedCreator<
        ArrayProxyInterface<Element['_T'], Stored> & Extension,
        HasDirty<O>
      >
  }

  mapped<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
    return this.concrete(configuration, isRoot)
  }

}

export function array<
  P extends Property<unknown>,
  E extends object = {},
  Stored = P extends ProxyProperty<any> ? ProxyMixed<P['_T'], true> : P['_T'],
>(
  options: { element: P; length?: number },
  decorate?: ProxyDecorator<ArrayProxyInterface<P['_T'], Stored>, E>,
) {
  return new ProperteaArray(options, decorate)
}
