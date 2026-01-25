import { Codecs } from 'crunches';

import { Diff, Instance, MarkClean, ProxyProperty, Set, SetWithDefaults, ToJSON, ToJSONWithoutDefaults } from './proxy.js';
import { registry } from './register.js';

const DataOffset = Symbol('DataOffset');
const DirtyOffset = Symbol('DirtyOffset');

const nop = () => {};

function codegen(code, context = {}) {
  return (new Function(Object.keys(context).join(','), code))(...Object.values(context));
}

registry.object = class extends ProxyProperty {

  constructor(blueprint) {
    super(blueprint);
    const properties = {};
    const dataWidths = [];
    let dirtyWidth = 0;
    for (const key in blueprint.properties) {
      const propertyBlueprint = blueprint.properties[key];
      // object shape accomodates proxy instance
      if (!registry[propertyBlueprint.type]) {
        throw new TypeError(
          `Propertea(object): property type '${propertyBlueprint.type}' not registered`
        );
      }
      class ObjectProperty extends registry[propertyBlueprint.type] {
        [Instance] = Symbol(key);
      }
      properties[key] = new ObjectProperty(propertyBlueprint);
      // accumulate widths
      dataWidths.push(properties[key].dataWidth);
      dirtyWidth += properties[key].dirtyWidth;
    }
    this.codec = new Codecs.object(blueprint);
    this.dataWidth = dataWidths.some((w) => 0 === w) ? 0 : dataWidths.reduce((l, r) => l + r, 0);
    this.dirtyWidth = dirtyWidth;
    this.properties = properties;
  }

  concrete(configuration = {}, isRoot = true) {
    const {blueprint, properties} = this;
    // compute children
    const children = {};
    for (const key in properties) {
      const property = properties[key];
      children[key] = property instanceof ProxyProperty
        ? property.concrete(configuration, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({children, configuration, isRoot});
    let dirtyIndex = 0;
    return (blueprint.Proxy ?? ((C) => C))(
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
            dirtyIndex += property.dirtyWidth;
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

  generateProxy({children, configuration, isRoot}) {
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
          dirtyOffset += property.dirtyWidth;
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
          bit += property.dirtyWidth;
        }
      };
    }
    const hasProxies = Object.values(properties)
      .some((property) => property instanceof ProxyProperty);
    return codegen(`
      const {dataWidth, dirtyWidth} = property;
      return class FixedObjectProxy extends ObjectProxy {
        constructor(dataIndex, dirtyIndex) {
          super(dataIndex, dirtyIndex);
          this[property[Instance]] = {
            ${Object.keys(properties).map((key) => `'${key}': undefined`).join(',')}
          };
          let dataOffset = ${configuration.data ? (isRoot ? 'dataIndex * dataWidth' : 'dataIndex') : 0};
          let dirtyOffset = ${configuration.dirty ? (isRoot ? 'dataIndex * dirtyWidth' : 'dirtyIndex') : 0};
          ${configuration.data ? 'this[DataOffset] = dataOffset;' : ''}
          ${configuration.dirty ? 'this[DirtyOffset] = dirtyOffset;' : ''}
          ${
            // constant key access
            Object.keys(children)
              .map((key) => {
                const isProxy = properties[key] instanceof ProxyProperty;
                return `{
                  const key = '${key}';
                  ${
                    // assign children; either values or new proxy instances
                    isProxy
                      ? 'this[property[Instance]][key] = new children[key](dataOffset, dirtyOffset)'
                      : 'this[key] = children[key]'
                  }
                  ${''/* increment offsets */}
                  ${(hasProxies && configuration.data) ? `dataOffset += properties[key].dataWidth;` : ''}
                  ${(hasProxies && configuration.dirty) ? `dirtyOffset += properties[key].dirtyWidth;` : ''}
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
              for (let i = 0; i < property.dirtyWidth; ++i) {
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
      children,
      configuration,
      DataOffset,
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

  map(configuration = {}, isRoot = true) {
    const {blueprint, properties} = this;
    const onDirty = configuration.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
    const children = {};
    // compute children
    for (const key in properties) {
      const property = properties[key];
      children[key] = property instanceof ProxyProperty
        ? property.map(configuration, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({children, configuration, isRoot});
    // apply blueprint proxy
    return (blueprint.Proxy ?? ((C) => C))(
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
                      return properties['${key}'].codec.decode(configuration.data, {
                        byteOffset: this[DataOffset] + ${dataIndex},
                        isLittleEndian: true,
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
                          properties['${key}'].codec.encode(
                            value,
                            configuration.data,
                            this[DataOffset] + ${dataIndex},
                            true,
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
              dataIndex += property.dataWidth;
              dirtyIndex += property.dirtyWidth;
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
