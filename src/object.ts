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
  ProxyProperty,
  Set,
  SetWithDefaults,
  ToJSON,
  ToJSONWithoutDefaults,
} from './proxy.js';

const DataOffset = Symbol('Propertea.object.DataOffset');
const DirtyOffset = Symbol('Propertea.object.DirtyOffset');

type Props = Record<string, Property<unknown>>
type AugmentedProps = Record<string, Property<unknown> & { [Instance]: symbol }>

type ProxyCallback = (p: ProperteaObject) => ProperteaObject

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

const proxyIdentity = (i) => i

const nop = () => {};

export class ProperteaObject extends ProxyProperty<any> {
  codec: ReturnType<typeof crunchesObject>
  properties: AugmentedProps
  proxy: ProxyCallback | undefined

  constructor(properties: Props, proxy?: ProxyCallback) {
    super()
    this.properties = {}
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
    this.proxy = proxy
    // TODO - only on root!
    // defineProperty(this, Instance, Symbol('Propertea.object.Root'))
  }
  concrete(configuration: ProxyConcreteConfiguration = {}, isRoot = true) {
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
    return (this.proxy ?? proxyIdentity)(
      codegen(`
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
      `, {
        configuration,
        DirtyOffset,
        Instance,
        onDirtyCallback: 'function' === typeof configuration.onDirty ? configuration.onDirty : nop,
        property: this,
        Proxy,
        Set,
      }),
    );
  }
  generateProxy({
    defaults,
    configuration,
    isRoot,
  }: {
    defaults: Record<string, any>,
    configuration: Partial<ProxyDataConfiguration> & Partial<ProxyDirtyConfiguration>,
    isRoot: boolean,
  }) {
    const {properties} = this;
    const onDirty = configuration.onDirty ?? true;
    // proxy API
    class ObjectProxy {
      [ToJSON]() {
        const json = {};
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
      [ToJSONWithoutDefaults](defaults) {
        let json;
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
    if (onDirty) {
      ObjectProxy.prototype[Diff] = function() {
        let diff;
        let dirtyOffset = this[DirtyOffset];
        for (const key in properties) {
          const property = properties[key];
          let keyDiff;
          // recur
          if (property instanceof ProxyProperty) {
            keyDiff = this[key][Diff]();
          }
          // check dirty bit
          else if (configuration.dirty[dirtyOffset >> 3] & (1 << (dirtyOffset & 7))) {
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

  mapped(configuration: ProxyMappedConfiguration, isRoot = true) {
    const {properties} = this;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
    const defaults = {};
    // compute defaults
    for (const key in properties) {
      const property = properties[key];
      defaults[key] = property instanceof ProxyProperty
        ? property.mapped(configuration, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({defaults, configuration, isRoot});
    // apply blueprint proxy
    return (this.proxy ?? proxyIdentity)(
      codegen(`
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
      `, {
        configuration,
        DataOffset,
        DirtyOffset,
        Instance,
        onDirtyCallback,
        properties,
        property: this,
        Proxy,
        Set,
      }),
    );
  }

}

export function object(
  properties: Props,
  proxy?: ProxyCallback
): ProperteaObject {
  return new ProperteaObject(properties, proxy)
}

// export const object = (properties: Props) => new ProperteaObject(properties)
