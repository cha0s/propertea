![CI](https://github.com/cha0s/propertea/actions/workflows/ci.yml/badge.svg)

# Propertea :tea:

A high-performance low-level state management system for games :video_game:.

Code generation (`new Function`) is used to generate a [monomorphic](https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html),  [proxy-like](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) shape from a blueprint. This keeps the [inline cache](https://mathiasbynens.be/notes/shapes-ics) hot and performant  while preserving the ergonomics of property access.

 
## :fire: Features

- Change/dirty tracking
- Creating and applying diffs
- Full (de)serialization to/from JSON
- Fixed-size contiguous binary representation for efficient state transformations using `TypedArray` or even WASM.
- Object pooling

## Examples :mag:

### Pool (fixed-size)

Given a blueprint schema for a 2D position with x and y coordinates, let's create a pool of positions and allocate a couple:

```js
import { Pool } from 'propertea';
// create
const positionPool = new Pool({
  type: 'object',
  properties: {
    x: {type: 'float32'},
    y: {type: 'float32'},
  },
});
// allocated with defaults
const first = positionPool.allocate();
assert(first.x === 0);
assert(first.y === 0);
// allocated with explicit value
const second = positionPool.allocate({x: 100, y: 200});
assert(second.x === 100);
assert(second.y === 200);
```

The state is mapped to contiguous memory:

```js
const view = new Float32Array(positionPool.data.memory.buffer);
// equivalent!
assert(view[0] === first.x);
assert(view[1] === first.y);
assert(view[2] === second.x);
assert(view[3] === second.y);
```

State synchronization is bidirectional; updating the proxy updates the buffer and vice-versa:

```js
// proxy -> buffer
second.x = 123;
assert(view[2] === 123);
// buffer -> proxy
view[3] = 234;
assert(second.y === 234);
```

### Pool (dynamic-sized)

Not all types are fixed-size. A familiar example would be a string.

Dynamic-sized types aren't mapped to contiguous memory. Their data lives in JS properties.

```js
// create
const userPool = new Pool({
  type: 'object',
  properties: {
    age: {type: 'uint32'},
    name: {type: 'string'},
  },
});
const user = userPool.allocate();
assert(user.age === 0);
assert(user.name === '');
// same structure, null buffer
assert(userPool.data.memory.buffer.byteLength === 0);
```

Notice that even though `age` is a `uint32` (a fixed-size type), **the type becomes dynamic-sized if any type contained within is dynamic-sized**.

### Change tracking

By default, changes are tracked. Let's continue with our position pool from above:

```js
import { Diff } from 'propertea';

const another = positionPool.allocate();
console.log(another[Diff]());
// {x: 0, y: 0}
```

Why is there already a diff? **Proxies are created dirty**. Think about a world with monsters. If a new monster spawns, all clients should receive an update with the new monster as a diff. Make sense?

A proxy may be marked clean:

```js
import { MarkClean } from 'propertea';
another[MarkClean]();
assert(another[Diff]() === undefined);
```

#### Reactivity

Changes may trigger a callback:

```js
const blueprint = {
  type: 'object',
  properties: {
    foo: {type: 'string'},
  },
};
const params = {
  onDirty: (
    // the dirty bit
    bit,
    // the proxy triggering this change
    proxy,
  ) => {
    // ... do something!
    console.log('bit:', bit, 'proxy:', proxy);
  }
};
const reactivePool = new Pool(blueprint, params);
reactivePool.allocate();
// bit: 0 proxy: ConcreteProxy {
//   [Symbol(element)]: { foo: '' },
//   [Symbol(DataOffset)]: 0,
//   [Symbol(DirtyOffset)]: 0
// }
```

### WASM

Pools are structured to be operated on by WASM. See [src/pool.test.wat](./src/pool.test.wat) for a minimal example of using WASM to transform data (and track changes).

Excerpted from [src/pool.test.js](./src/pool.test.js):

```js
const pool = new Pool({
  type: 'object',
  properties: {
    z: {
      type: 'float32',
    },
  },
});
// generate random samples and use them to initialize our pool
const samples = [];
for (let i = 0; i < 10; ++i) {
  const sample = Math.random();
  samples.push(sample);
  pool.allocate({z: sample});
}
pool.markClean();
// compile the WAT to WASM and get the exports
const {default: buffer} = await import('./pool.test.wat?multi_memory');
const exports = await WebAssembly.instantiate(buffer, {pool: pool.imports()})
  .then(({instance: {exports}}) => exports);
// generate a random sample to pass to the WASM
const parameter = Math.random();
exports.thisIsAWasmTest(parameter);
```

**NOTE:** Reactive callbacks are not invoked by WASM.

### Serialization

The proxy can be serialized to JSON:

```js
import { ToJSON } from 'propertea';
console.log(another[ToJSON]());
// {x: 0, y: 0}
```

## Motivation

Networked real-time applications with arbitrarily-large mutable state (read: games :video_game:) need to efficiently synchronize state from server to client(s). This generally involves tracking state changes and sending only the delta each update interval ("diffing").

### Performance

It is greatly beneficial for performance when data is arranged contiguously so that e.g. SIMD may be leveraged for data transformations.

This library is *fast*. As you can see in [`src/pool.bench.js`](./src/pool.bench.js), Propertea beats native JavaScript by 100-1000x transforming contiguous data. Pooled allocations actually beat native after warming the pool.

### Onward and upward

Specifically, this is motivated by my pure JavaScript ECS [ecstc](https://github.com/cha0s/ecstc) which I'm working on open sourcing.

## TODO

- Fixed-length arrays
- Fixed-shape maps (depends on `crunches` codec support)
- More array proxy ops
