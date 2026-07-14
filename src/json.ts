import { CrunchesJson, type CrunchesJSONOutput } from 'crunches'

import {
  DataOffset,
  Diff,
  DirtyOffset,
  Initialize,
  MarkClean,
  type ProxyClass,
  type ProxyCreatorMappedConfiguration,
  type ProxyCreatorConcreteConfiguration,
  type ProxyDecorator,
  type ProxyMixedCreator,
  ProxyProperty,
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

interface JsonProxyInterface extends ProxyClass {
  value: CrunchesJSONOutput

  [Diff](): CrunchesJSONOutput | undefined
  [ProperteaSet](value: CrunchesJSONOutput): void
  [Initialize](value?: CrunchesJSONOutput): void
  [ToJSON](): CrunchesJSONOutput
  [ToJSONWithoutDefaults](defaults?: any): CrunchesJSONOutput | undefined
}

export class ProperteaJson<Decorator extends object = {}>
  extends ProxyProperty<JsonProxyInterface, Decorator, CrunchesJSONOutput>
{
  codec = new CrunchesJson().optional()
  decorate: ProxyDecorator<JsonProxyInterface, Decorator> | undefined
  defaultValue = {}

  concrete(configuration: ProxyCreatorConcreteConfiguration, isRoot = true) {
    const { byteWidth, defaultValue, dirtyByteWidth } = this
    let patchMap = new WeakMap<any, CrunchesJSONOutput>()
    const onDirty = configuration.onDirty ?? (() => {})

    class JsonProxy {

      ;[DataOffset]: number
      ;[DirtyOffset]: number
      value: CrunchesJSONOutput = {}

      constructor(indexOrDataOffset: number, dirtyOffset?: number) {
        this[DataOffset] = isRoot ? indexOrDataOffset * byteWidth : indexOrDataOffset
        this[DirtyOffset] = isRoot ? indexOrDataOffset * dirtyByteWidth : dirtyOffset!
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
          this.value = applyPatch(this.value, patch)
          let mappedPatch = patchMap.get(this)
          if (!isObject(mappedPatch)) {
            mappedPatch = {}
          }
          mappedPatch = applyPatch(mappedPatch, patch)
          patchMap.set(this, mappedPatch)
        }
        else {
          this.value = patch
          patchMap.set(this, patch)
        }
        onDirty(this[DirtyOffset], this)
      }

      ;[Initialize](value?: CrunchesJSONOutput) {
        this.value = value ?? {}
        this[MarkClean]()
        patchMap.set(this, value ?? {})
        onDirty(this[DirtyOffset], this)
      }

      ;[MarkClean]() {
        patchMap.delete(this)
      }

      ;[ToJSON](): CrunchesJSONOutput {
        return this.value as CrunchesJSONOutput
      }

      // TODO
      ;[ToJSONWithoutDefaults](_defaults?: any): CrunchesJSONOutput | undefined {
        return this[ToJSON]()
      }

      static markClean() {
        patchMap = new WeakMap<any, CrunchesJSONOutput>()
      }

      patch(value: CrunchesJSONOutput) {
        this[ProperteaSet](value)
      }

    }
    const Decorated = this.decorate ? this.decorate(JsonProxy) : JsonProxy
    return Decorated as ProxyMixedCreator<JsonProxy & Decorator>
  }

  mapped(configuration: ProxyCreatorMappedConfiguration, isRoot = true) {
    return this.concrete(configuration, isRoot)
  }

}

export const json = () => new ProperteaJson()
