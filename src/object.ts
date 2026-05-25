import { object as crunchesObject, type CrunchesType } from 'crunches'

import { Property } from '#types'

import {
  Diff,
  Instance,
  MarkClean,
  type ProxyConcreteConfiguration,
  type ProxyDataConfiguration,
  type ProxyDirtyConfiguration,
  type ProxyMappedConfiguration,
  type ProxyClass,
  ProxyProperty,
  Set,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.js';

const DataOffset = Symbol('Propertea.object.DataOffset');
const DirtyOffset = Symbol('Propertea.object.DirtyOffset');

type Props = Record<string, Property<unknown>>

export type InferObject<P extends Props> = { [K in keyof P]:  P[K]['_T'] }

type ProxyCreator<P extends Props> = new (dataIndex: number) => (
  ProxyClass<InferObject<P>> & InferObject<P>
)

type ProxyCreatorWithDirtyTracking<P extends Props> = new (dataIndex: number, dirtyIndex?: number) => (
  ProxyClass<InferObject<P>> & InferObject<P> & {
    [Diff](): Record<string, any> | undefined
    [MarkClean](): object
  }
)

function codegen(code: string, context = {}) {
  return (new Function(Object.keys(context).join(','), code))(...Object.values(context));
}

function defineProperty<T extends object, K extends PropertyKey, V>(
  obj: T,
  key: K,
  value: V
): asserts obj is T & { [P in K]: V } {
  Object.defineProperty(obj, key, { value });
}

const nop = () => {};

export class ProperteaObject<P extends Record<string, Property<unknown>>>
  extends ProxyProperty<InferObject<P>>
{
  codec: ReturnType<typeof crunchesObject>
  properties: P

  constructor(properties: P) {
    super()
    this.properties = {} as P
    const codecProperties: Record<string, CrunchesType<unknown>> = {}
    const byteWidths = [];
    let dirtyByteWidth = 0;
    for (const key in properties) {
      const propertea = properties[key]
      // augment with instance symbol
      defineProperty(propertea, Instance, Symbol(`Propertea.object.property.${key}`))
      this.properties[key] = propertea
      // map codecs
      codecProperties[key] = propertea.codec
      // accumulate widths
      byteWidths.push(propertea.byteWidth);
      dirtyByteWidth += propertea.dirtyByteWidth;
    }
    // store codec and computed widths
    this.codec = crunchesObject(codecProperties)
    this.byteWidth = byteWidths.some((w) => 0 === w) ? 0 : byteWidths.reduce((l, r) => l + r, 0);
    this.dirtyByteWidth = dirtyByteWidth;
    // @ts-expect-error TODO - only on root!
    // defineProperty(this, Instance, Symbol('Propertea.object.Root'))
  }
  concrete<O extends ProxyConcreteConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ):
    O['dirty'] extends Uint8Array ? ProxyCreatorWithDirtyTracking<P> : ProxyCreator<P>
  {
    const {properties} = this;
    // compute defaults
    const defaults: Record<string, any> = {};
    for (const key in properties) {
      const property = properties[key];
      defaults[key] = property instanceof ProxyProperty
        ? property.concrete(configuration, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({defaults, configuration, isRoot});
    let dirtyIndex = 0;
    return codegen(
      `
        return class ConcreteProxy extends Proxy {
          ${Object.entries(properties).map(([key, property]) => {
            const props = `
              get ['${key}']() { return this[property[Instance]]['${key}']; }
              ${
                property instanceof ProxyProperty
                  ? `set ['${key}'](value) { this[property[Instance]]['${key}'][Set](value); }`
                  : (
                    configuration.dirty
                      ? `
                        set ['${key}'](value) {
                          // remember
                          const previous = this[property[Instance]]['${key}'];
                          this[property[Instance]]['${key}'] = value;
                          // dirty if different
                          if (previous !== value) {
                            const bit = ${dirtyIndex} + this[DirtyOffset];
                            configuration.dirty[bit >> 3] |= 1 << (bit & 7);
                            ${isRoot ? `onDirtyCallback(bit, this);` : ''}
                          }
                        }
                      `
                      : `set ['${key}'](value) { this[property[Instance]]['${key}'] = value; }`
                  )
              }
            `;
            dirtyIndex += property.dirtyByteWidth;
            return props;
          }).join('\n')}
        }
      `,
      {
        configuration,
        DirtyOffset,
        Instance,
        onDirtyCallback: 'function' === typeof configuration.onDirty ? configuration.onDirty : nop,
        property: this,
        Proxy,
        Set,
      }
    )
  }
  generateProxy({
    defaults,
    configuration,
    isRoot,
  }: {
    defaults: Record<string, any>,
    configuration: Partial<ProxyDataConfiguration> & Partial<ProxyDirtyConfiguration>,
    isRoot: boolean,
  }): ProxyClass<InferObject<P>> {
    const { properties } = this;
    const { dirty } = configuration;
    // proxy API
    class ObjectProxy implements Omit<ProxyClass<InferObject<P>>, typeof SetWithDefaults | typeof Set> {
      [ToJSON]() {
        const json: Record<string, any> = {};
        for (const key in properties) {
          if (properties[key] instanceof ProxyProperty) {
            json[key] = this[key][ToJSON]();
          }
          else {
            json[key] = this[key];
          }
        }
        return json;
      }
      [ToJSONWithoutDefaults](defaults?: Record<string, any>) {
        let json: Record<string, any> | undefined = undefined;
        for (const key in properties) {
          let keyJson;
          if (properties[key] instanceof ProxyProperty) {
            keyJson = this[key][ToJSONWithoutDefaults](defaults?.[key]);
          }
          else if ((defaults?.[key] ?? properties[key].defaultValue) !== this[key]) {
            keyJson = this[key];
          }
          if (undefined !== keyJson) {
            json ??= {};
            json[key] = keyJson;
          }
        }
        return json;
      }
    }
    // dirty API
    if (dirty) {
      ObjectProxy.prototype[Diff] = function() {
        let diff: Record<string, any> | undefined;
        let dirtyOffset = this[DirtyOffset];
        for (const key in properties) {
          const property = properties[key];
          let keyDiff;
          // recur
          if (property instanceof ProxyProperty) {
            keyDiff = this[key][Diff]();
          }
          // check dirty bit
          else if (dirty[dirtyOffset >> 3] & (1 << (dirtyOffset & 7))) {
            keyDiff = this[key];
          }
          if (undefined !== keyDiff) {
            diff ??= {};
            diff[key] = keyDiff;
          }
          dirtyOffset += property.dirtyByteWidth;
        }
        return diff;
      };
      ObjectProxy.prototype[MarkClean] = function() {
        let bit = this[DirtyOffset];
        for (const key in properties) {
          const property = properties[key];
          if (property instanceof ProxyProperty) {
            this[key][MarkClean]();
          }
          else if (configuration.dirty) {
            configuration.dirty[bit >> 3] &= ~(1 << (bit & 7));
          }
          bit += property.dirtyByteWidth;
        }
      };
    }
    const hasProxies = Object.values(properties)
      .some((property) => property instanceof ProxyProperty);
    return codegen(`
      const {byteWidth, dirtyByteWidth} = property;
      return class FixedObjectProxy extends ObjectProxy {
        constructor(dataIndex, dirtyIndex) {
          super(dataIndex, dirtyIndex);
          this[property[Instance]] = {
            ${Object.keys(properties).map((key) => `'${key}': undefined`).join(',')}
          };
          let dataOffset = ${configuration.data ? (isRoot ? 'dataIndex * byteWidth' : 'dataIndex') : 0};
          let dirtyOffset = ${configuration.dirty ? (isRoot ? 'dataIndex * dirtyByteWidth' : 'dirtyIndex') : 0};
          ${configuration.data ? 'this[DataOffset] = dataOffset;' : ''}
          ${configuration.dirty ? 'this[DirtyOffset] = dirtyOffset;' : ''}
          ${
            // constant key access
            Object.keys(defaults)
              .map((key) => {
                const isProxy = properties[key] instanceof ProxyProperty;
                return `{
                  const key = '${key}';
                  ${
                    // assign defaults; either values or new proxy instances
                    isProxy
                      ? 'this[property[Instance]][key] = new defaults[key](dataOffset, dirtyOffset)'
                      : 'this[key] = defaults[key]'
                  }
                  ${''/* increment offsets */}
                  ${(hasProxies && configuration.data) ? `dataOffset += properties[key].byteWidth;` : ''}
                  ${(hasProxies && configuration.dirty) ? `dirtyOffset += properties[key].dirtyByteWidth;` : ''}
                }`;
              }).join('\n')
          }
        }
        [Set](value) {
          if (!value) return;
          ${
            Object.keys(properties)
              .map((key) => `if ('${key}' in value) { this['${key}'] = value['${key}']; }`)
              .join('\n')
          }
        }
        [SetWithDefaults](value) {
          if (value) {
            ${
              Object.keys(properties).map((key) => `{
                let localValue;
                if ('${key}' in value) {
                  localValue = value['${key}'];
                }
                else if (property.defaultValue && '${key}' in property.defaultValue) {
                  localValue = property.defaultValue['${key}'];
                }
                else {
                  localValue = properties['${key}'].defaultValue;
                }
                ${
                  properties[key] instanceof ProxyProperty
                    ? `this['${key}'][SetWithDefaults](localValue);`
                    : `this['${key}'] = localValue;`
                }
              }`).join('\n')
            }
          }
          else {
            ${
              Object.keys(properties).map((key) => `{
                let localValue;
                if (property.defaultValue && '${key}' in property.defaultValue) {
                  localValue = property.defaultValue['${key}'];
                }
                else {
                  localValue = properties['${key}'].defaultValue;
                }
                ${
                  properties[key] instanceof ProxyProperty
                    ? `this['${key}'][SetWithDefaults](localValue);`
                    : `this['${key}'] = localValue;`
                }
              }`).join('\n')
            }
          }
          ${
            configuration.dirty
            ? `
              let bit = this[DirtyOffset];
              for (let i = 0; i < property.dirtyByteWidth; ++i) {
                if (0 === (configuration.dirty[bit >> 3] & 1 << (bit & 7))) {
                  configuration.dirty[bit >> 3] |= 1 << (bit & 7);
                  onDirtyCallback(bit, this);
                }
                bit += 1;
              }
            `
            : ''
          }
        }
      }
    `, {
      configuration,
      DataOffset,
      defaults,
      DirtyOffset,
      Instance,
      onDirtyCallback: 'function' === typeof configuration.onDirty ? configuration.onDirty : nop,
      properties,
      property: this,
      ObjectProxy,
      Set,
      SetWithDefaults,
    });
  }

  mapped<O extends ProxyMappedConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ):
    O['dirty'] extends Uint8Array ? ProxyCreatorWithDirtyTracking<P> : ProxyCreator<P>
  {
    const {properties} = this;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
    const defaults: Record<string, any> = {};
    // compute defaults
    for (const key in properties) {
      const property = properties[key];
      defaults[key] = property instanceof ProxyProperty
        ? property.mapped(configuration, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({defaults, configuration, isRoot});
    // apply blueprint proxy
    return codegen(
      `
        return class MappedProxy extends Proxy {
          ${(() => {
            let dataIndex = 0;
            let dirtyIndex = 0;
            return Object.entries(properties).map(([key, property]) => {
              const props = `
                ${
                  property instanceof ProxyProperty
                  ? `get ['${key}']() { return this[property[Instance]]['${key}']; }`
                  : `
                    get ['${key}']() {
                      return properties['${key}'].codec.decodeFrom(configuration.data, {
                        byteOffset: this[DataOffset] + ${dataIndex},
                      });
                    }
                  `
                }
                ${
                  property instanceof ProxyProperty
                    ? `set ['${key}'](value) { this[property[Instance]]['${key}'][Set](value); }`
                    : (
                      `
                        set ['${key}'](value) {
                          ${
                            configuration.dirty
                            ? `const previous = this['${key}'];`
                            : ''
                          }
                          properties['${key}'].codec.encodeInto(
                            value,
                            configuration.data,
                            this[DataOffset] + ${dataIndex},
                          );
                          ${
                            configuration.dirty
                            ? `
                              if (previous !== value) {
                                const bit = ${dirtyIndex} + this[DirtyOffset];
                                configuration.dirty[bit >> 3] |= 1 << (bit & 7);
                                ${isRoot ? 'onDirtyCallback(bit, this);' : ''}
                              }
                            `
                            : ''
                          }
                        }
                      `
                    )
                }
              `;
              dataIndex += property.byteWidth;
              dirtyIndex += property.dirtyByteWidth;
              return props;
            }).join('\n')

          })()}
        }
      `,
      {
        configuration,
        DataOffset,
        DirtyOffset,
        Instance,
        onDirtyCallback,
        properties,
        property: this,
        Proxy,
        Set,
      }
    )
  }

}

export function object<P extends Record<string, Property<unknown>>>(
  properties: P,
) {
  return new ProperteaObject(properties)
}

// export const object = (properties: Props) => new ProperteaObject(properties)
