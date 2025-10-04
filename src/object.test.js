import {expect, test} from 'vitest';

import './object.js';
import './primitives.js';
import {Diff, Set, SetWithDefaults, ToJSON, ToJSONWithoutDefaults} from './proxy.js';
import {registry} from './register.js';

test('concrete', () => {
  const property = new registry.object({properties: {x: {type: 'uint8'}}});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  expect(proxy).toMatchObject({x: 0});
  proxy.x = 12;
  expect(proxy).toMatchObject({x: 12});
});

test('concrete shapeless', () => {
  const property = new registry.object({properties: {x: {type: 'string'}}});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  expect(proxy).toMatchObject({x: ''});
  proxy.x = 'foobar';
  expect(proxy).toMatchObject({x: 'foobar'});
});

test('nested', () => {
  const property = new registry.object({properties: {o: {type: 'object', properties: {x: {type: 'uint8'}}}}});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  expect(proxy).toMatchObject({o: {x: 0}});
  proxy.o.x = 12;
  expect(proxy).toMatchObject({o: {x: 12}});
});

test('dirty', () => {
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {type: 'uint8'},
    z: {type: 'uint8'},
    a: {type: 'uint8'},
  }});
  const dirty = new Uint8Array([0]);
  const Proxy = property.concrete({dirty});
  const proxy = new Proxy(0);
  expect(dirty).toEqual(new Uint8Array([15]));
  dirty[0] = 0;
  proxy.x = 2;
  expect(dirty).toEqual(new Uint8Array([1]));
  proxy.z = 2;
  expect(dirty).toEqual(new Uint8Array([1 | 4]));
  proxy.y = 2;
  expect(dirty).toEqual(new Uint8Array([1 | 2 | 4]));
  dirty.fill(0);
  proxy.a = 2;
  expect(dirty).toEqual(new Uint8Array([8]));
});

test('onDirty', () => {
  let dirties = 0;
  const property = new registry.object({
    properties: {
      x: {type: 'uint8'},
      y: {type: 'uint8'},
      z: {type: 'uint8'},
      a: {type: 'uint8'},
    },
  });
  const dirty = new Uint8Array([0]);
  const Proxy = property.concrete({dirty, onDirty: () => { dirties += 1; }});
  expect(dirties).toEqual(0);
  const proxy = new Proxy(0);
  expect(dirties).toEqual(4);
  dirties = 0;
  proxy.x = 2;
  expect(dirties).toEqual(1);
  proxy.z = 2;
  expect(dirties).toEqual(2);
  proxy.y = 2;
  expect(dirties).toEqual(3);
  proxy.y = 2;
  expect(dirties).toEqual(3);
});

test('mapped onDirty', () => {
  let dirties = 0;
  const data = new DataView(new ArrayBuffer(4));
  const dirty = new Uint8Array([0]);
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {defaultValue: 23, type: 'uint8'},
    z: {defaultValue: 34, type: 'uint8'},
    a: {type: 'object', properties: {n: {type: 'uint8'}}},
  }});
  const Proxy = property.map({data, dirty, onDirty: () => { dirties += 1; }});
  expect(dirties).toEqual(0);
  const proxy = new Proxy(0);
  proxy[SetWithDefaults]();
  expect(dirties).toEqual(4);
  dirties = 0;
  proxy.x = 2;
  expect(dirties).toEqual(1);
  proxy.z = 2;
  expect(dirties).toEqual(2);
  proxy.y = 2;
  expect(dirties).toEqual(3);
  proxy.y = 2;
  expect(dirties).toEqual(3);
});

test('toJSON', () => {
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {type: 'uint8'},
    z: {type: 'uint8'},
    a: {type: 'object', properties: {n: {type: 'uint8'}}},
  }});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.x = 1;
  proxy.y = 2;
  proxy.z = 3;
  proxy.a.n = 4;
  expect(proxy[ToJSON]()).toEqual({x: 1, y: 2, z: 3, a: {n: 4}});
});

test('toJSONWithoutDefaults', () => {
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {defaultValue: 23, type: 'uint8'},
    z: {defaultValue: 34, type: 'uint8'},
    a: {type: 'object', properties: {n: {type: 'uint8'}}},
  }});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy.x = 1;
  proxy.y = 2;
  proxy.z = 34;
  proxy.a.n = 4;
  expect(proxy[ToJSONWithoutDefaults]()).toEqual({x: 1, y: 2, a: {n: 4}});
  proxy.y = 23;
  expect(proxy[ToJSONWithoutDefaults]()).toEqual({x: 1, a: {n: 4}});
  expect(proxy[ToJSONWithoutDefaults]({a: {n: 4}})).toEqual({x: 1});
});

test('diff', () => {
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {defaultValue: 23, type: 'uint8'},
    z: {defaultValue: 34, type: 'uint8'},
    a: {type: 'object', properties: {n: {type: 'uint8'}}},
  }});
  const dirty = new Uint8Array([0]);
  const Proxy = property.concrete({dirty});
  const proxy = new Proxy(0);
  dirty[0] = 0;
  expect(proxy[Diff]()).toEqual(undefined);
  proxy.x = 1;
  expect(proxy[Diff]()).toEqual({x: 1});
  dirty[0] |= 8;
  expect(proxy[Diff]()).toEqual({a: {n: 0}, x: 1});
  dirty[0] = 0;
  expect(proxy[Diff]()).toEqual(undefined);
});

test('mapped nested', () => {
  const data = new DataView(new ArrayBuffer(1));
  const property = new registry.object({properties: {o: {type: 'object', properties: {x: {type: 'uint8'}}}}});
  const Proxy = property.map({data});
  const proxy = new Proxy(0);
  expect(proxy).toMatchObject({o: {x: 0}});
  expect(data.getUint8(0, true)).toEqual(0);
  proxy.o.x = 12;
  expect(data.getUint8(0, true)).toEqual(12);
  expect(proxy).toMatchObject({o: {x: 12}});
});

test('mapped diff', () => {
  const data = new DataView(new ArrayBuffer(4));
  const dirty = new Uint8Array([0]);
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {defaultValue: 23, type: 'uint8'},
    z: {defaultValue: 34, type: 'uint8'},
    a: {type: 'object', properties: {n: {type: 'uint8'}}},
  }});
  const Proxy = property.map({data, dirty});
  const proxy = new Proxy(0);
  dirty.fill(0);
  expect(proxy[Diff]()).toEqual(undefined);
  proxy.x = 1;
  expect(proxy[Diff]()).toEqual({x: 1});
  dirty[0] |= 8;
  expect(proxy[Diff]()).toEqual({a: {n: 0}, x: 1});
  dirty[0] = 0;
  expect(proxy[Diff]()).toEqual(undefined);
});

test('set', () => {
  const property = new registry.object({properties: {
    x: {type: 'uint8'},
    y: {type: 'uint8'},
    z: {type: 'uint8'},
    a: {type: 'uint8'},
  }});
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy[Set]({x: 3, y: 6});
  expect(proxy.x).toEqual(3);
  expect(proxy.y).toEqual(6);
});

test('default value', () => {
  const property = new registry.object({
    defaultValue: {y: 2, z: 3},
    properties: {
      x: {defaultValue: 1, type: 'uint8'},
      y: {type: 'uint8'},
      z: {defaultValue: 6, type: 'uint8'},
      a: {type: 'uint8'},
    },
  });
  const Proxy = property.concrete();
  const proxy = new Proxy(0);
  proxy[SetWithDefaults]();
  expect(proxy[ToJSON]()).toEqual({x: 1, y: 2, z: 3, a: 0});
});
