import { CrunchesObject, CrunchesOptional, type CrunchesType } from 'crunches'

import { type DeepPartial } from './internal-types.ts'
import {
  DataOffset,
  Diff,
  DirtyOffset,
  Initialize,
  Instance,
  MarkClean,
  type ProxyCreatorConcreteConfiguration,
  type ProxyCreatorMappedConfiguration,
  type ProxyDecorator,
  type ProxyMixed,
  ProxyProperty,
  Set,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.js'
import { Propertea } from './propertea.ts'

export type ProperteaObjectProps = Record<string, Propertea<unknown>>

export type ProperteaObjectProxyInterface<Props extends Record<string, Propertea<any>>> = {
  [K in keyof Props]: Props[K] extends ProxyProperty<any>
    ? ProxyMixed<Props[K]['_T'] & Props[K]['_E']>
    : Props[K]['_T']
}

function codegen(code: string, context = {}) {
  return (new Function(Object.keys(context).join(','), code))(...Object.values(context))
}

export function defineProperty<T extends object, K extends PropertyKey, V>(
  obj: T,
  key: K,
  value: V
): asserts obj is T & { [P in K]: V } {
  Object.defineProperty(obj, key, { value })
}

const nop = () => {}

export class ProperteaObject<
  P extends ProperteaObjectProps,
  Decorator extends object = {},
>
  extends ProxyProperty<ProperteaObjectProxyInterface<P>, Decorator>
{

  codec: CrunchesOptional<CrunchesObject<any>>
  decorate: ProxyDecorator<ProperteaObjectProxyInterface<P>, Decorator> | undefined
  properties: P

  constructor(
    properties: P,
    decorate?: ProxyDecorator<ProperteaObjectProxyInterface<P>, Decorator>,
  ) {
    super()
    this.decorate = decorate
    this.properties = {} as P
    const codecProperties: Record<string, CrunchesOptional<CrunchesType<unknown>>> = {}
    const byteWidths = []
    let dirtyByteWidth = 0
    for (const key in properties) {
      const propertea = properties[key]
      this.properties[key] = propertea
      // map codecs
      codecProperties[key] = propertea.codec
      // accumulate widths
      byteWidths.push(propertea.byteWidth)
      dirtyByteWidth += propertea.dirtyByteWidth
    }
    // store codec and computed widths
    this.codec = new CrunchesObject(codecProperties).optional()
    this.byteWidth = byteWidths.some((w) => 0 === w) ? 0 : byteWidths.reduce((l, r) => l + r, 0)
    this.dirtyByteWidth = dirtyByteWidth
    // augment with instance symbol
    defineProperty(this, Instance, Symbol('Propertea.object.root'))

  }
  concrete(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot = true,
  ) {
    const { properties } = this
    // compute defaults
    const defaults: Record<string, any> = {}
    for (const key in properties) {
      const property = properties[key]
      defaults[key] = property instanceof ProxyProperty
        ? property.concrete(configuration, false)
        : property.defaultValue
    }
    const Proxy = this.generateProxy({defaults, configuration, isRoot})
    let dirtyIndex = 0
    const Base = codegen(
      `
        const {[Instance]: symbol} = property
        return class ConcreteProxy extends Proxy {
          ${Object.entries(properties).map(([key, property]) => {
            const sanitizedKey = JSON.stringify(key)
            const props = `
              get [${sanitizedKey}]() { return this[symbol][${sanitizedKey}]; }
              ${
                property instanceof ProxyProperty
                  ? `
                    set [${sanitizedKey}](value) { this[symbol][${sanitizedKey}][Set](value); }
                  `
                  : `
                    set [${sanitizedKey}](value) {
                      // remember
                      const previous = this[symbol][${sanitizedKey}]
                      this[symbol][${sanitizedKey}] = value
                      // dirty if different
                      if (previous !== value) {
                        const bit = ${dirtyIndex} + this[DirtyOffset]
                        configuration.dirty[bit >> 3] |= 1 << (bit & 7)
                        onDirtyCallback(bit, this)
                      }
                    }
                  `
              }
            `
            dirtyIndex += property.dirtyByteWidth
            return props
          }).join('\n')}
        }
      `,
      {
        configuration,
        DirtyOffset,
        Instance,
        onDirtyCallback: configuration.onDirty ?? nop,
        property: this,
        Proxy,
        Set,
      }
    )
    return this.decorate ? this.decorate(Base) : Base
  }
  generateProxy({
    defaults,
    configuration,
    isRoot,
  }: {
    defaults: Record<string, any>,
    configuration: ProxyCreatorConcreteConfiguration & { data?: DataView },
    isRoot: boolean,
  }) {
    const { properties } = this
    // proxy API
    class ObjectProxy {
      ;[Diff]() {
        let diff: Record<string, any> | undefined
        let dirtyOffset = this[DirtyOffset]
        for (const key in properties) {
          const property = properties[key]
          let keyDiff
          // recur
          if (property instanceof ProxyProperty) {
            keyDiff = (this as any)[key][Diff]()
          }
          // check dirty bit
          else if (configuration.dirty[dirtyOffset >> 3] & (1 << (dirtyOffset & 7))) {
            keyDiff = (this as any)[key]
          }
          if (undefined !== keyDiff) {
            diff ??= {}
            diff[key] = keyDiff
          }
          dirtyOffset += property.dirtyByteWidth
        }
        return diff
      }
      // @ts-expect-error - set in generated constructor
      ;[DirtyOffset]: number
      static markClean() {
        for (const key in properties) {
          const property = properties[key]
          if (property instanceof ProxyProperty) {
            defaults[key].markClean()
          }
        }
      }
      ;[MarkClean]() {
        let bit = this[DirtyOffset]
        for (const key in properties) {
          const property = properties[key]
          if (property instanceof ProxyProperty) {
            (this as any)[key][MarkClean]()
          }
          else {
            configuration.dirty[bit >> 3] &= ~(1 << (bit & 7))
          }
          bit += property.dirtyByteWidth
        }
      }
      ;[ToJSON]() {
        const json: Record<string, any> = {}
        for (const key in properties) {
          if (properties[key] instanceof ProxyProperty) {
            json[key] = (this as any)[key][ToJSON]()
          }
          else {
            json[key] = (this as any)[key]
          }
        }
        return json
      }
      ;[ToJSONWithoutDefaults](defaults?: Record<string, any>) {
        let json: Record<string, any> | undefined = undefined
        for (const key in properties) {
          let keyJson
          if (properties[key] instanceof ProxyProperty) {
            keyJson = (this as any)[key][ToJSONWithoutDefaults](defaults?.[key])
          }
          else if ((defaults?.[key] ?? properties[key].defaultValue) !== (this as any)[key]) {
            keyJson = (this as any)[key]
          }
          if (undefined !== keyJson) {
            json ??= {}
            json[key] = keyJson
          }
        }
        return json
      }
    }
    interface ObjectProxy {
      [Set](value?: DeepPartial<ProperteaObjectProxyInterface<P>>): void
      [Initialize](value?: DeepPartial<ProperteaObjectProxyInterface<P>>): void
    }
    return codegen(`
      const {
        byteWidth,
        defaultValue,
        dirtyByteWidth,
        [Instance]: symbol,
      } = property
      return class FixedObjectProxy extends ObjectProxy {
        constructor(dataIndex, dirtyIndex) {
          super(dataIndex, dirtyIndex)
          this[symbol] = {
            ${
              Object.entries(properties)
                .filter(([, property]) => property instanceof ProxyProperty)
                .map(([key]) => `${JSON.stringify(key)}: undefined`).join(',')
            }
          }
          let dataOffset = ${
            configuration.data ? (isRoot ? 'dataIndex * byteWidth' : 'dataIndex') : 0
          }
          let dirtyOffset = ${(isRoot ? 'dataIndex * dirtyByteWidth' : 'dirtyIndex')}
          ${configuration.data ? 'this[DataOffset] = dataOffset;' : ''}
          this[DirtyOffset] = dirtyOffset
          ${
            // constant key access
            Object.keys(defaults)
              .map((key) => {
                const isProxy = properties[key] instanceof ProxyProperty
                return `{
                  const key = ${JSON.stringify(key)}
                  ${
                    // assign defaults; either values or new proxy instances
                    isProxy
                      ? 'this[symbol][key] = new defaults[key](dataOffset, dirtyOffset)'
                      : 'this[key] = defaults[key]'
                  }
                  ${''/* increment offsets */}
                  ${configuration.data ? `dataOffset += properties[key].byteWidth;` : ''}
                  dirtyOffset += properties[key].dirtyByteWidth
                }`
              }).join('\n')
          }
        }
        ;[Set](value) {
          if (!value) return
          ${
            Object.keys(properties)
              .map((key) => {
                const sanitizedKey = JSON.stringify(key)
                return `if (${sanitizedKey} in value) { this[${sanitizedKey}] = value[${sanitizedKey}]; }`
              })
              .join('\n')
          }
        }
        ;[Initialize](value) {
          if (value) {
            ${
              Object.keys(properties).map((key) => {
                const sanitizedKey = JSON.stringify(key)
                return `
                  {
                    let localValue
                    if (${sanitizedKey} in value) {
                      localValue = value[${sanitizedKey}]
                    }
                    else if (defaultValue && ${sanitizedKey} in defaultValue) {
                      localValue = defaultValue[${sanitizedKey}]
                    }
                    else {
                      localValue = properties[${sanitizedKey}].defaultValue
                    }
                    ${
                      properties[key] instanceof ProxyProperty
                        ? `this[${sanitizedKey}][Initialize](localValue);`
                        : `this[${sanitizedKey}] = localValue;`
                    }
                  }
                `
              }).join('\n')
            }
          }
          else {
            ${
              Object.keys(properties).map((key) => {
                const sanitizedKey = JSON.stringify(key)
                return `
                  {
                    let localValue
                    if (defaultValue && ${sanitizedKey} in defaultValue) {
                      localValue = defaultValue[${sanitizedKey}]
                    }
                    else {
                      localValue = properties[${sanitizedKey}].defaultValue
                    }
                    ${
                      properties[key] instanceof ProxyProperty
                        ? `this[${sanitizedKey}][Initialize](localValue);`
                        : `this[${sanitizedKey}] = localValue;`
                    }
                  }
                `
              }).join('\n')
            }
          }
          let bit = this[DirtyOffset]
          for (let i = 0; i < dirtyByteWidth; ++i) {
            if (0 === (configuration.dirty[bit >> 3] & 1 << (bit & 7))) {
              configuration.dirty[bit >> 3] |= 1 << (bit & 7)
              onDirtyCallback(bit, this)
            }
            bit += 1
          }
        }
      }
    `, {
      configuration,
      DataOffset,
      defaults,
      DirtyOffset,
      Initialize,
      Instance,
      onDirtyCallback: configuration.onDirty ?? nop,
      properties,
      property: this,
      ObjectProxy,
      Set,
    }) as ObjectProxy
  }

  mapped(
    configuration: ProxyCreatorMappedConfiguration,
    isRoot = true,
  ) {
    const { properties } = this
    const defaults: Record<string, any> = {}
    // compute defaults
    for (const key in properties) {
      const property = properties[key]
      defaults[key] = property instanceof ProxyProperty
        ? property.mapped(configuration, false)
        : property.defaultValue
    }
    const Proxy = this.generateProxy({defaults, configuration, isRoot})
    // apply blueprint proxy
    const Base = codegen(
      `
        const {[Instance]: symbol} = property
        return class MappedProxy extends Proxy {
          ${(() => {
            let dataIndex = 0
            let dirtyIndex = 0
            return Object.entries(properties).map(([key, property]) => {
              const sanitizedKey = JSON.stringify(key)
              const props = `
                ${
                  property instanceof ProxyProperty
                  ? `
                    get [${sanitizedKey}]() { return this[symbol][${sanitizedKey}]; }
                  `
                  : `
                    get [${sanitizedKey}]() {
                      return properties[${sanitizedKey}].codec.decodeFrom(configuration.data, {
                        byteOffset: this[DataOffset] + ${dataIndex},
                      })
                    }
                  `
                }
                ${
                  property instanceof ProxyProperty
                    ? `
                      set [${sanitizedKey}](value) { this[symbol][${sanitizedKey}][Set](value); }
                    `
                    : `
                      set [${sanitizedKey}](value) {
                        const previous = this[${sanitizedKey}]
                        properties[${sanitizedKey}].codec.encodeInto(
                          value,
                          configuration.data,
                          this[DataOffset] + ${dataIndex},
                        )
                        if (previous !== value) {
                          const bit = ${dirtyIndex} + this[DirtyOffset]
                          configuration.dirty[bit >> 3] |= 1 << (bit & 7)
                          onDirtyCallback(bit, this)
                        }
                      }
                    `
                }
              `
              dataIndex += Number(property.byteWidth)
              dirtyIndex += Number(property.dirtyByteWidth)
              return props
            }).join('\n')

          })()}
        }
      `,
      {
        configuration,
        DataOffset,
        DirtyOffset,
        Instance,
        onDirtyCallback: configuration.onDirty ?? nop,
        properties,
        property: this,
        Proxy,
        Set,
      }
    )
    return this.decorate ? this.decorate(Base) : Base
  }

}

export function object<
  P extends ProperteaObjectProps,
  Decorator extends object = {},
>(
  properties: P,
  decorate?: ProxyDecorator<ProperteaObjectProxyInterface<P>, Decorator>,
) {
  return new ProperteaObject(properties, decorate)
}
