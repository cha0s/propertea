import {Codecs} from 'crunches';

import {Diff, Initialize, MarkClean, ProxyProperty, Set, ToJSON, ToJSONWithoutDefaults} from './proxy.js';
import {registry} from './register.js';

const DataOffset = Symbol('DataOffset');
const DirtyOffset = Symbol('DirtyOffset');
const Instance = Symbol('Instance');

const nop = () => {};

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
        throw new TypeError(`Propertea: '${propertyBlueprint.type}' not registered`);
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

  concrete(views = {}, isRoot = true) {
    const {blueprint, properties} = this;
    const onDirty = views.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
    // compute children
    const children = {};
    for (const key in properties) {
      const property = properties[key];
      children[key] = property instanceof ProxyProperty
        ? property.concrete(views, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({children, isRoot, views});
    let dirtyIndex = 0;
    const bound = {
      children,
      DataOffset,
      DirtyOffset,
      Instance,
      onDirtyCallback,
      properties,
      property: this,
      Proxy,
      Set,
      views,
    };
    const ConcreteProxy = (new Function(Object.keys(bound).join(','), `
      return class ConcreteProxy extends Proxy {
        ${Object.entries(properties).map(([key, property]) => {
          const props = `
            get ['${key}']() { return this[property[Instance]]['${key}']; }
            ${
              property instanceof ProxyProperty
                ? `set ['${key}'](value) { this[property[Instance]]['${key}'][Set](value); }`
                : (
                  views.dirty
                    ? `
                      set ['${key}'](value) {
                        // remember
                        const previous = this[property[Instance]]['${key}'];
                        this[property[Instance]]['${key}'] = value;
                        // dirty if different
                        if (previous !== value) {
                          const bit = ${dirtyIndex} + this[DirtyOffset];
                          const i = bit >> 3;
                          const j = 1 << (bit & 7);
                          views.dirty[i] |= j;
                          onDirtyCallback(bit, this);
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
    `))(...Object.values(bound));
    // apply blueprint proxy
    return (blueprint.Proxy ?? ((C) => C))(ConcreteProxy);
  }

  generateProxy({children, isRoot, views}) {
    const {properties} = this;
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
    if (views.onDirty ?? true) {
      ObjectProxy.prototype[Diff] = function() {
        let diff;
        let dirtyOffset = this[DirtyOffset];
        for (const key in properties) {
          const property = properties[key];
          const i = dirtyOffset >> 3;
          const j = 1 << (dirtyOffset & 7);
          let keyDiff;
          // recur
          if (property instanceof ProxyProperty) {
            keyDiff = this[key][Diff]();
          }
          // check dirty bit
          else if (views.dirty[i] & j) {
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
          const i = bit >> 3;
          const j = 1 << (bit & 7);
          views.dirty[i] &= ~j;
          if (property instanceof ProxyProperty) {
            property[MarkClean]();
          }
          bit += property.dirtyWidth;
        }
      };
    }
    ObjectProxy.prototype[Initialize] = (new Function('DirtyOffset, properties, views', `
      return function(value) {
        ${views.dirty ? 'let bit = this[DirtyOffset]' : ''}
        ${
          Object.keys(properties).map((key) => `{
            const key = '${key}';
            this[key] = (value && key in value) ? value[key] : properties[key].defaultValue;
            ${
              views.dirty
                ? `
                  const i = bit >> 3;
                  const j = 1 << (bit & 7);
                  views.dirty[i] |= j;
                  bit += properties[key].dirtyWidth;
                `
                : ''
            }
          }`).join('\n')
        }
      };
    `))(DirtyOffset, properties, views);
    ObjectProxy.prototype[Set] = this.makePropertySetter('this', this.properties);
    const bound = {
      children,
      DataOffset,
      DirtyOffset,
      Instance,
      properties,
      property: this,
      ObjectProxy,
      views,
    };
    const hasProxies = Object.values(properties)
      .some((property) => property instanceof ProxyProperty);
    const Proxy = (new Function(Object.keys(bound).join(','), `
      const {dataWidth, dirtyWidth} = property;
      return class FixedObjectProxy extends ObjectProxy {
        constructor(dataIndex, dirtyIndex) {
          super(dataIndex, dirtyIndex);
          this[property[Instance]] = {
            ${Object.keys(properties).map((key) => `'${key}': undefined`).join(',')}
          };
          let dataOffset = ${views.data ? (isRoot ? 'dataIndex * dataWidth' : 'dataIndex') : 0};
          let dirtyOffset = ${views.dirty ? (isRoot ? 'dataIndex * dirtyWidth' : 'dirtyIndex') : 0};
          ${views.data ? 'this[DataOffset] = dataOffset;' : ''}
          ${views.dirty ? 'this[DirtyOffset] = dirtyOffset;' : ''}
          ${
            // constant key access
            Object.keys(children)
              .map((key) => {
                const isProxy = properties[key] instanceof ProxyProperty;
                return `{
                  const key = '${key}';
                  ${''/* assign children; either values or new proxy instances */}
                  ${isProxy ? `this[property[Instance]][key]` : `this[key]`} = ${
                    isProxy ? `new children[key](dataOffset, dirtyOffset)` : `children[key]`
                  };
                  ${''/* increment offsets */}
                  ${(hasProxies && views.data) ? `dataOffset += properties[key].dataWidth;` : ''}
                  ${(hasProxies && views.dirty) ? `dirtyOffset += properties[key].dirtyWidth;` : ''}
                }`;
              }).join('\n')
          }
        }
      }
    `))(...Object.values(bound));
    return Proxy;
  }

  makePropertySetter(destination, properties) {
    const bound = {Instance, properties: this.properties};
    // constant key access
    return (new Function(Object.keys(bound).join(','), `
      return function (v) {
        if (!v) return;
        ${
          Object.keys(properties)
            .map((key) => `if ('${key}' in v) { ${destination}['${key}'] = v['${key}']; }`)
            .join('\n')
        }
      };
    `))(...Object.values(bound));
  }

  map(views = {}, isRoot = true) {
    const {blueprint, properties} = this;
    const onDirty = views.onDirty ?? true;
    const onDirtyCallback = 'function' === typeof onDirty ? onDirty : nop;
    const children = {};
    // compute children
    for (const key in properties) {
      const property = properties[key];
      children[key] = property instanceof ProxyProperty
        ? property.map(views, false)
        : property.defaultValue;
    }
    const Proxy = this.generateProxy({children, isRoot, views});
    let dataIndex = 0;
    let dirtyIndex = 0;
    const bound = {
      DataOffset,
      DirtyOffset,
      Instance,
      onDirtyCallback,
      properties,
      property: this,
      Proxy,
      Set,
      views,
    };
    const MappedProxy = (new Function(Object.keys(bound).join(','), `
      return class MappedProxy extends Proxy {
        ${Object.entries(properties).map(([key, property]) => {
          const props = `
            ${
              property instanceof ProxyProperty
              ? `get ['${key}']() { return this[property[Instance]]['${key}']; }`
              : `
                get ['${key}']() {
                  return properties['${key}'].codec.decode(views.data, {
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
                  views.dirty
                    ? `
                      set ['${key}'](value) {
                        // remember
                        const previous = this['${key}'];
                        properties['${key}'].codec.encode(value, views.data, this[DataOffset] + ${dataIndex}, true);
                        // dirty if different
                        if (previous !== value) {
                          const bit = ${dirtyIndex} + this[DirtyOffset];
                          views.dirty[bit >> 3] |= 1 << (bit & 7);
                          onDirtyCallback(bit, this);
                        }
                      }
                    `
                    : `
                      set ['${key}'](value) {
                        properties['${key}'].codec.encode(value, views.data, this[DataOffset] + ${dataIndex}, true);
                      }
                    `
                )
            }
          `;
          dataIndex += property.dataWidth;
          dirtyIndex += property.dirtyWidth;
          return props;
        }).join('\n')}
      }
    `))(...Object.values(bound));
    // apply blueprint proxy
    return (blueprint.Proxy ?? ((C) => C))(MappedProxy);
  }

}
