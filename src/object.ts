import { object as crunchesObject, type CrunchesType } from 'crunches'

import {
  Diff,
  type HasDirty,
  Instance,
  MarkClean,
  type ProxyClass,
  type ProxyCreatorConfiguration,
  type ProxyDataConfiguration,
  type ProxyDecorator,
  type ProxyDirtyConfiguration,
  type ProxyMixed,
  type ProxyMixedCreator,
  ProxyProperty,
  Set,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.js';
import { Property } from './types.ts'

const DataOffset = Symbol('Propertea.object.DataOffset');
const DirtyOffset = Symbol('Propertea.object.DirtyOffset');

type Props = Record<string, Property<unknown>>

// type InferObjectGetters<P extends Props> = {
//   get [K in keyof P](): P[K] extends ProxyProperty<any>
//     ? ProxyMixed<P[K]['_T'], true>
//     : P[K]['_T']
// }

// type InferObjectSetters<P extends Props> = {
//   set [K in keyof P](v: Props[K]['_Input'])
// }

// type InferObject<P extends Props> = InferObjectGetters<P> & InferObjectSetters<P>
type InferObject<Props extends Record<string, Property<any>>> = {
  [K in keyof Props]: Props[K] extends ProxyProperty<any>
    ? ProxyMixed<Props[K]['_T'], true>
    : Props[K]['_T']
}
// type InferObject<P extends Props> = { [K in keyof P]:  P[K]['_T'] }

function codegen(code: string, context = {}) {
  return (new Function(Object.keys(context).join(','), code))(...Object.values(context));
}

export function defineProperty<T extends object, K extends PropertyKey, V>(
  obj: T,
  key: K,
  value: V
): asserts obj is T & { [P in K]: V } {
  Object.defineProperty(obj, key, { value });
}

const nop = () => {};

export class ProperteaObject<
  P extends Record<string, Property<unknown>>,
  E extends object = {},
>
  extends ProxyProperty<InferObject<P>, E>
{
  codec: ReturnType<typeof crunchesObject>
  decorate: ProxyDecorator<InferObject<Props>, E> | undefined
  properties: P

  constructor(
    properties: P,
    decorate?: ProxyDecorator<InferObject<Props>, E>,
  ) {
    super()
    this.decorate = decorate
    this.properties = {} as P
    const codecProperties: Record<string, CrunchesType<unknown>> = {}
    const byteWidths = [];
    let dirtyByteWidth = 0;
    for (const key in properties) {
      const propertea = properties[key]
      this.properties[key] = propertea
      // augment with instance symbol
      defineProperty(propertea, Instance, Symbol(`Propertea.object.property.${key}`))
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
  }
  concrete<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
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
    const Base = codegen(
      `
        const {[Instance]: symbol = Symbol.for('Propertea.object.root')} = property;
        return class ConcreteProxy extends Proxy {
          ${Object.entries(properties).map(([key, property]) => {
            const props = `
              get ['${key}']() { return this[symbol]['${key}']; }
              ${
                property instanceof ProxyProperty
                  ? `set ['${key}'](value) { this[symbol]['${key}'][Set](value); }`
                  : (
                    configuration.dirty
                      ? `
                        set ['${key}'](value) {
                          // remember
                          const previous = this[symbol]['${key}'];
                          this[symbol]['${key}'] = value;
                          // dirty if different
                          if (previous !== value) {
                            const bit = ${dirtyIndex} + this[DirtyOffset];
                            configuration.dirty[bit >> 3] |= 1 << (bit & 7);
                            ${isRoot ? `onDirtyCallback(bit, this);` : ''}
                          }
                        }
                      `
                      : `set ['${key}'](value) { this[symbol]['${key}'] = value; }`
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
    return (this.decorate ? this.decorate(Base) : Base) as ProxyMixedCreator<InferObject<P> & E, HasDirty<O>>
  }
  generateProxy<O extends ProxyDirtyConfiguration>({
    defaults,
    configuration,
    isRoot,
  }: {
    defaults: Record<string, any>,
    configuration: Partial<ProxyDataConfiguration> & Partial<O>,
    isRoot: boolean,
  }): ProxyClass<InferObject<P>> {
    const { properties } = this;
    // proxy API
    class ObjectProxy {
      [ToJSON]() {
        const json: Record<string, any> = {};
        for (const key in properties) {
          if (properties[key] instanceof ProxyProperty) {
            json[key] = (this as Record<string, any>)[key][ToJSON]();
          }
          else {
            json[key] = (this as Record<string, any>)[key];
          }
        }
        return json;
      }
      [ToJSONWithoutDefaults](defaults?: Record<string, any>) {
        let json: Record<string, any> | undefined = undefined;
        for (const key in properties) {
          let keyJson;
          if (properties[key] instanceof ProxyProperty) {
            keyJson = (this as Record<string, any>)[key][ToJSONWithoutDefaults](defaults?.[key]);
          }
          else if ((defaults?.[key] ?? properties[key].defaultValue) !== (this as Record<string, any>)[key]) {
            keyJson = (this as Record<string, any>)[key];
          }
          if (undefined !== keyJson) {
            json ??= {};
            json[key] = keyJson;
          }
        }
        return json;
      }
    }
    interface ObjectProxy {
      [Diff](): Record<string, any> | undefined
      [DirtyOffset]: number
      [MarkClean](): void
    }
    // dirty API
    if (configuration.onDirty ?? true) {
      ObjectProxy.prototype[Diff] = function() {
        let diff: Record<string, any> | undefined;
        let dirtyOffset = this[DirtyOffset];
        for (const key in properties) {
          const property = properties[key];
          let keyDiff;
          // recur
          if (property instanceof ProxyProperty) {
            keyDiff = (this as Record<string, any>)[key][Diff]();
          }
          // check dirty bit
          else if (configuration.dirty![dirtyOffset >> 3] & (1 << (dirtyOffset & 7))) {
            keyDiff = (this as Record<string, any>)[key];
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
            (this as Record<string, any>)[key][MarkClean]();
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
      const {
        byteWidth,
        defaultValue,
        dirtyByteWidth,
        [Instance]: symbol = Symbol.for('Propertea.object.root'),
      } = property;
      return class FixedObjectProxy extends ObjectProxy {
        constructor(dataIndex, dirtyIndex) {
          super(dataIndex, dirtyIndex);
          this[symbol] = {
            ${
              Object.entries(properties)
                .filter(([, property]) => property instanceof ProxyProperty)
                .map(([key]) => `'${key}': undefined`).join(',')
            }
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
                      ? 'this[symbol][key] = new defaults[key](dataOffset, dirtyOffset)'
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
                else if (defaultValue && '${key}' in defaultValue) {
                  localValue = defaultValue['${key}'];
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
                if (defaultValue && '${key}' in defaultValue) {
                  localValue = defaultValue['${key}'];
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
              for (let i = 0; i < dirtyByteWidth; ++i) {
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

  mapped<O extends ProxyCreatorConfiguration>(
    configuration: O = {} as any,
    isRoot = true,
  ) {
    const {properties} = this;
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
    const Base = codegen(
      `
        const {[Instance]: symbol = Symbol.for('Propertea.object.root')} = property;
        return class MappedProxy extends Proxy {
          ${(() => {
            let dataIndex = 0;
            let dirtyIndex = 0;
            return Object.entries(properties).map(([key, property]) => {
              const props = `
                ${
                  property instanceof ProxyProperty
                  ? `get ['${key}']() { return this[symbol]['${key}']; }`
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
                    ? `set ['${key}'](value) { this[symbol]['${key}'][Set](value); }`
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
        onDirtyCallback: 'function' === typeof configuration.onDirty ? configuration.onDirty : nop,
        properties,
        property: this,
        Proxy,
        Set,
      }
    )
    return (this.decorate ? this.decorate(Base) : Base) as ProxyMixedCreator<InferObject<P> & E, HasDirty<O>>
  }

}

export function object<P extends Record<string, Property<unknown>>, E extends object = {}>(
  properties: P,
  decorate?: ProxyDecorator<InferObject<Props>, E>,
) {
  return new ProperteaObject(properties, decorate)
}
