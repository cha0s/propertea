import '../src/object.js';
import {Pool} from '../src/pool.js';
import '../src/primitives.js';

import buffer from './pool.test.wat?multi_memory'

const N = 100000;

const blueprint = {
  type: 'object',
  properties: {
    x: {
      type: 'object',
      properties: {
        y: {
          type: 'object',
          properties: {
            z: {
              defaultValue: 123,
              type: 'float32',
            },
          },
        },
      },
    },
  },
};

const pool = new Pool(blueprint);
const exports = await WebAssembly.instantiate(buffer, {pool: pool.imports()})
  .then(({instance: {exports}}) => exports);

function create() {
  for (let i = 0; i < N; ++i) {
    new Struct(i);
  }
}

class Y {
  z = 123;
}
class X {
  constructor() {
    this.y = new Y();
  }
}
class P {
  constructor() {
    this.x = new X();
  }
}

function createNative() {
  for (let i = 0; i < N; ++i) {
    new P();
  }
}

const Concrete = pool.property.concrete();
function createConcrete() {
  for (let i = 0; i < N; ++i) {
    new Concrete(i);
  }
}

function allocate() {
  for (let i = 0; i < N; ++i) {
    pool.allocate();
  }
}

function allocateNative() {
  const proxies = [];
  for (let i = 0; i < N; ++i) {
    proxies.push(new P());
  }
}

function setNative(setting) {
  for (let i = 0; i < N; ++i) {
    setting[i].x.y.z += i + 1;
  }
}

function setAllocated(setting) {
  for (let i = 0; i < N; ++i) {
    setting[i].x.y.z += i + 1;
  }
}

let start;
function measure(label) {
  const ms = performance.now() - start;
  console.log(
    `\x1b[33m${ms.toFixed(2).padStart(7, ' ')}\x1b[0mms`,
    `(\x1b[33m${(ms / N * 1000).toFixed(4)}\x1b[0mμs/op)`,
    `(\x1b[33m${Math.floor(N * (16.6 / ms)).toLocaleString().padStart(10, ' ')}\x1b[0m/tick)`,
    'to',
    label,
  );
}

function clear(pool) {
  for (const proxy of pool.proxies) {
    if (proxy) {
      pool.free(proxy);
    }
  }
  pool.views.dirty?.fill(0);
  pool.length.value = 0;
  pool.freeList = [];
  pool.proxies = [];
}

function warm(f, ...args) {
  for (let i = 0; i < 1000000 / N; ++i) {
    f(...args);
  }
  global.gc();
}

// const localeN = N.toLocaleString();
const label = `pool (N=${N.toLocaleString()})`;
console.log(label);
console.log('='.repeat(label.length + 1));

const Struct = pool.property.map({data: new DataView(new ArrayBuffer(N * pool.property.dataWidth))});
warm(create);
start = performance.now();
create();
measure('create');

warm(createNative);
start = performance.now();
createNative();
measure('create native');

warm(createConcrete);
start = performance.now();
createConcrete();
measure('create concrete');

warm(() => {
  allocate();
  clear(pool);
});
start = performance.now();
allocate();
measure('allocate');
clear(pool);

warm(() => {
  allocate();
  for (const proxy of pool.proxies) {
    if (proxy) {
      pool.free(proxy);
    }
  }
});
start = performance.now();
allocate();
measure('\x1b[93mallocate (cached)\x1b[0m');
clear(pool);

warm(allocateNative);
start = performance.now();
allocateNative();
measure('allocate native');

{
  const setting = Array(N);
  for (let i = 0; i < N; ++i) {
    setting[i] = new P();
  }
  warm(setNative, setting);
  start = performance.now();
  setNative(setting);
  measure('set native');
}

{
  const setting = Array(N);
  for (let i = 0; i < N; ++i) {
    setting[i] = pool.allocate();
  }
  warm(() => {
    setAllocated(setting);
    clear(pool);
  }, setting);
  start = performance.now();
  setAllocated(setting);
  clear(pool);
  measure('set allocated');
}

{
  const setting = Array(N);
  for (let i = 0; i < N; ++i) {
    setting[i] = pool.allocate();
  }
  const r = Math.random();
  warm(() => {
    exports.thisIsAWasmTest(r);
    clear(pool);
  }, setting);
  start = performance.now();
  pool.views.dirty.fill(0)
  exports.thisIsAWasmTest(r);
  measure('\x1b[93mset allocated (buffer)\x1b[0m');
}
