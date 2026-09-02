import {
  CrunchesJson,
  type CrunchesJsonOptions,
  type CrunchesJSONOutput,
  type CrunchesOptional,
} from 'crunches'

import {
  DataOffset,
  Diff,
  DirtyOffset,
  Initialize,
  MarkClean,
  type ProxyClass,
  type ProxyConstructorMappedConfiguration,
  type ProxyConstructorConcreteConfiguration,
  type ProxyDecorator,
  type ProxyConstructorMixed,
  ProxyPropertea,
  Set as ProperteaSet,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.ts'

type AnyObject = Record<string, any>

function isObject(item: any): item is AnyObject {
  return item && typeof item === 'object'
}

function applyPatch<T extends AnyObject, U extends AnyObject>(target: T, source: U): T & U {
  const output = Array.isArray(target) ? [...target] : { ...target } as any
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key]
        }
        else {
          output[key] = applyPatch(target[key], source[key])
        }
      }
      else {
        output[key] = source[key]
      }
    }
  }
  return output
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length
      && keys.every((key) => deepEqual((a as AnyObject)[key], (b as AnyObject)[key]))
  }
  return false
}

interface JsonProxyInterface extends ProxyClass {
  value: CrunchesJSONOutput

  [Diff](): CrunchesJSONOutput | undefined
  [ProperteaSet](value: CrunchesJSONOutput): void
  [Initialize](value?: CrunchesJSONOutput): void
  [ToJSON](): CrunchesJSONOutput
  [ToJSONWithoutDefaults](defaults?: any): CrunchesJSONOutput | undefined
  patch(value: CrunchesJSONOutput): void
}

/**
 * JSON Propertea.
 */
export class ProperteaJson<Decorator extends object = {}>
  extends ProxyPropertea<JsonProxyInterface, Decorator, CrunchesJSONOutput>
{
  codec: CrunchesOptional<CrunchesJson>
  decorate: ProxyDecorator<JsonProxyInterface, Decorator> | undefined
  defaultValue = {}

  constructor(options?: CrunchesJsonOptions) {
    super()
    this.codec = new CrunchesJson(options).optional()
  }

  concrete(configuration: ProxyConstructorConcreteConfiguration, isRoot = true) {
    const { byteWidth, defaultValue, dirtyBitWidth } = this
    let patchMap = new WeakMap<any, CrunchesJSONOutput>()
    const onDirty = configuration.onDirty ?? (() => {})

    class JsonProxy {

      ;[DataOffset]: number
      ;[DirtyOffset]: number
      value: CrunchesJSONOutput = {}

      constructor(indexOrDataOffset: number, dirtyOffset?: number) {
        this[DataOffset] = isRoot ? indexOrDataOffset * byteWidth : indexOrDataOffset
        this[DirtyOffset] = isRoot ? indexOrDataOffset * dirtyBitWidth : dirtyOffset!
        this[Initialize](defaultValue)
      }

      ;[Diff](): CrunchesJSONOutput | undefined {
        return patchMap.get(this)
      }

      ;[ProperteaSet](patch: CrunchesJSONOutput) {
        if (isObject(patch)) {
          if (!isObject(this.value)) {
            this.value = {}
          }
          const merged = applyPatch(this.value, patch)
          // no-op patch: nothing changed
          if (deepEqual(merged, this.value)) {
            return
          }
          this.value = merged
          let mappedPatch = patchMap.get(this)
          if (!isObject(mappedPatch)) {
            mappedPatch = {}
          }
          mappedPatch = applyPatch(mappedPatch, patch)
          patchMap.set(this, mappedPatch)
        }
        else {
          if (deepEqual(patch, this.value)) {
            return
          }
          this.value = patch
          patchMap.set(this, patch)
        }
        onDirty(this[DirtyOffset])
      }

      ;[Initialize](value?: CrunchesJSONOutput) {
        this.value = value ?? {}
        this[MarkClean]()
        patchMap.set(this, value ?? {})
        onDirty(this[DirtyOffset])
      }

      ;[MarkClean]() {
        patchMap.delete(this)
      }

      ;[ToJSON](): CrunchesJSONOutput {
        return this.value as CrunchesJSONOutput
      }

      ;[ToJSONWithoutDefaults](_defaults?: any): CrunchesJSONOutput | undefined {
        return deepEqual(this.value, defaultValue) ? undefined : this[ToJSON]()
      }

      static markClean() {
        patchMap = new WeakMap<any, CrunchesJSONOutput>()
      }

      patch(value: CrunchesJSONOutput) {
        this[ProperteaSet](value)
      }

    }
    const Decorated = this.decorate ? this.decorate(JsonProxy) : JsonProxy
    return Decorated as ProxyConstructorMixed<JsonProxy & Decorator>
  }

  mapped(configuration: ProxyConstructorMappedConfiguration, isRoot = true) {
    return this.concrete(configuration, isRoot)
  }

}

/**
 * Create JSON Propertea.
 */
export const json = (options?: CrunchesJsonOptions) => new ProperteaJson(options)
