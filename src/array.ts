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
  setAt(key: number, value: T | undefined): void
  setLength(length: number): void
  at(key: number): Stored | undefined
  dirty: Set<number>
  pool: any
  [ToJSON](): T[]
  [ToJSONWithoutDefaults](defaults?: any): T[] | undefined
  [ProperteaSet](value?: Iterable<T> | ArrayDiff<T>): void
  [SetWithDefaults](value?: Iterable<T> | ArrayDiff<T>): void
}

export class ProperteaArray<
  P extends Property<unknown>,
  E extends object = {},
  Stored = P extends ProxyProperty<any> ? ProxyMixed<P['_T'], true> : P['_T'],
>
  extends ProxyProperty<ArrayProxyInterface<P['_T'], Stored>, Iterable<P['_T']> | ArrayDiff<P['_T']>>
  // extends ProxyProperty<ArrayProxyInterface<P['_T'], Stored>>
{
  codec: ReturnType<typeof crunchesArray>
  decorate: ProxyDecorator<P['_T'], E> | undefined
  property: P

  constructor(
    { element, length = 0 }: { element: P; length?: number },
    decorate?: ProxyDecorator<P['_T'], E>,
  ) {
    super();
    this.decorate = decorate
    this.property = element
    this.codec = crunchesArray({ element: element.codec, length })
  }

  concrete<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
    const { property } = this;
    const { defaultValue } = this;
    const { dirtyByteWidth } = property;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;

    class ArrayProxy {
      $$array: P['_T'][] = []

      constructor() {
        // this.pool = pool;
        this[ProperteaSet](defaultValue);
      }

      ;[ProperteaSet](value?: Iterable<P['_T']> | ArrayDiff<P['_T']>): void {
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

      [SetWithDefaults](value?: Iterable<P['_T']> | ArrayDiff<P['_T']>): void {
        this[ProperteaSet](value)
      }

      [ToJSON](): P['_T'][] {
        const json = [];
        for (const value of this.$$array) {
          json.push(property instanceof ProxyProperty ? (value as typeof property['_T'])[ToJSON]() : value);
        }
        return json;
      }

      [ToJSONWithoutDefaults](_defaults?: any): P['_T'][] | undefined {
        return this[ToJSON]()
      }

      /**
       * A set of indices that have been marked as dirty.
       */
      dirty = new Set<number>();

      at(key: number) {
        return this.$$array[key]
      }
    }

    interface ArrayProxy {
      [Diff](): Record<string, any> | undefined
      [MarkClean](): void
      pool: any
      setAt(key: number, value: P['_T'] | undefined): void
      setLength(length: number): void
    }

    if (property instanceof ProxyProperty) {
      const Base = property.concrete(configuration, isRoot);
      const Concrete = class extends Base {
        [Key]: number | undefined = undefined;
        [ArraySymbol]: ArrayProxy | undefined = undefined;
      } as typeof Base;
      const pool = new Pool(
        property,
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
      ArrayProxy.prototype.setAt = function(key: number, value: DeepPartial<P['_T']> | undefined) {
        if (undefined === value && key in this.$$array) {
          pool.free(this.$$array[key]);
        }
        if (onDirty) {
          this.dirty.add(key);
        }
        let localValue;
        if (this.$$array[key]) {
          (this.$$array[key] as typeof property['_T'])[ProperteaSet](
            value instanceof Concrete
              ? (value as typeof property['_T'])[ToJSON]()
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
          if (onDirty) {
            this.dirty.add(i);
          }
        }
        this.$$array.length = length;
      }
    }
    else {

      ArrayProxy.prototype.setLength = function(length: number) {
        for (let i = this.$$array.length - 1; i >= length; --i) {
          if (onDirty) {
            this.dirty.add(i);
          }
        }
        this.$$array.length = length;
      }

      ArrayProxy.prototype.setAt = function(key: number, value: P['_T'] | undefined) {
        if (onDirty) {
          this.dirty.add(key);
        }
        const previous = this.$$array[key];
        this.$$array[key] = value;
        if (previous !== value) {
          onDirtyCallback(key, this);
        }
      }


    }

    if (onDirty) {
      ArrayProxy.prototype[Diff] = function() {
        const entries: Record<number, any> = {};
        if (property instanceof ProxyProperty) {
          for (const dirty of this.dirty) {
            const v = this.$$array[dirty];
            // If the value is a proxy property, recursively generate its diff.
            entries[dirty] = undefined === v ? undefined : v[Diff]();
          }
        }
        else {
          for (const dirty of this.dirty) {
            entries[dirty] = this.$$array[dirty];
          }
        }
        return entries;
      };
      ArrayProxy.prototype[MarkClean] = function() {
        this.dirty.clear();
        if (property instanceof ProxyProperty) {
          for (const value of this.$$array) {
            value[MarkClean]();
          }
        }
      };
    }
    return (
      this.decorate
        ? this.decorate(ArrayProxy)
        : ArrayProxy
      // ) as ProxyMixedCreator<ArrayProxyInterface<P['_T']> & E, HasDirty<O>>
      ) as ProxyMixedCreator<ArrayProxyInterface<P['_T'], Stored> & E, HasDirty<O>>
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
>(
  options: { element: P; length?: number },
  decorate?: ProxyDecorator<P['_T'], E>,
) {
  return new ProperteaArray(options, decorate)
}
