![CI](https://github.com/cha0s/propertea/actions/workflows/test.yml/badge.svg)

# Propertea :tea:

A high-performance low-level state management system for games :video_game:.

Generate [monomorphic](https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html), [proxy-like](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) shapes. Keeps the [inline cache](https://mathiasbynens.be/notes/shapes-ics) hot and performant while preserving the ergonomics of property access, dirty tracking, and change notification callbacks.

 
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
import { float32, object, Pool } from 'propertea'

// create
const positionPool = new Pool(object({
  x: float32(),
  y: float32(),
}))
// allocated with defaults
const first = positionPool.allocate()
expect(first.x).to.equal(0)
expect(first.y).to.equal(0)
// allocated with explicit value
const second = positionPool.allocate({ x: 100, y: 200 })
expect(second.x).to.equal(100)
expect(second.y).to.equal(200)
```

The state is mapped to contiguous memory:

```js
const view = new Float32Array(positionPool.data.memory.buffer)
// equivalent!
expect(view[0]).to.equal(first.x)
expect(view[1]).to.equal(first.y)
expect(view[2]).to.equal(second.x)
expect(view[3]).to.equal(second.y)
```

State synchronization is bidirectional; updating the proxy updates the buffer and vice-versa:

```js
// proxy -> buffer
second.x = 123
expect(view[2]).to.equal(123)
// buffer -> proxy
view[3] = 234
expect(second.y).to.equal(234)
```

Just note that setting the memory dirctly will bypass the automatic dirty tracking and change notification. This means it's really fast! You'll need to manage those yourself when you need them, though.

### Pool (dynamic)

Not all types are fixed-size. A familiar example would be a string.

Dynamic-sized types aren't mapped to contiguous memory. Their data lives in JS properties.

```js
import { object, Pool, string, uint32 } from 'propertea'

// create
const userPool = new Pool(object({
  age: uint32(),
  name: string(),
}))
const user = userPool.allocate()
expect(user.age).to.equal(0)
expect(user.name).to.equal('')
// same structure; empty buffer
expect(userPool.data.memory.buffer.byteLength).to.equal(0)
```

Notice that even though `age` is a `uint32` (a fixed-size type), **`userPool` becomes dynamic-sized when any type contained within is dynamic-sized**.

### Change tracking

By default, changes are tracked. Let's continue with our position pool from above:

```js
import { Diff } from 'propertea'

const another = positionPool.allocate()
expect(another[Diff]()).to.deep.equal({ x: 0, y: 0 })
```

Why is there already a diff? **Proxies are created dirty**. Think about a game world with monsters. If a new monster spawns, all clients should automatically treat the new monster as a change. Make sense?

A proxy may be marked clean:

```js
import { MarkClean } from 'propertea'

another[MarkClean]()
expect(another[Diff]()).to.equal(undefined)
```

#### Reactivity

Changes may trigger a callback:

```js
import { object, Pool, string } from 'propertea'

let bits: number[] = []
const reactivePool = new Pool(object({
  foo: string(),
}), {
  onDirty: (
    // the dirty bit
    bit,
  ) => {
    // ... do something!
    bits.push(bit)
  }
})
reactivePool.allocate()
reactivePool.allocate()
expect(bits).to.deep.equal([0, 1])
```

### WASM

**Note**: Chrome has laughably bad WASM memory management and the default of using WASM memory has been disabled due to out of memory errors when using less than 100 MB of memory. This is due to Chrome allocating ***4 GB*** per instance for "safety".

Pools ~~are~~ can be optionally structured to be operated on by WASM. See [src/pool.test.wat](./src/pool.test.wat) for a minimal example of using WASM to transform data (and track changes).

Excerpted from [src/pool.test.js](./src/pool.test.js):

```js
import { float32, object, Pool } from 'propertea'

const pool = new Pool(object({
  z: float32(),
}), {
  useWasm: true,
})
// generate random samples and use them to initialize our pool
const samples = []
for (let i = 0; i < 10; ++i) {
  const sample = Math.random()
  samples.push(sample)
  pool.allocate({z: sample})
}
pool.markClean()
// compile the WAT to WASM and get the exports
const {default: buffer} = await import('./pool.test.wat?multi_memory')

// type the exports if you're using TypeScript
interface WasmTestExports extends Record<string, any> {
  thisIsAWasmTest: (arg: number) => void
}
const exports = await WebAssembly.instantiate(buffer, {pool: pool.wasmImports()})
  .then(({instance: {exports}}) => exports as WasmTestExports)
// generate a random sample to pass to the WASM
const parameter = Math.random()
exports.thisIsAWasmTest(parameter)
```

**NOTE:** Dirty/change callbacks can not be invoked by WASM.

### Serialization

The proxy can be serialized to JSON:

```js
import { ToJSON } from 'propertea'
expect(JSON.stringify(another[ToJSON]())).to.equal('{"x":0,"y":0}')
```

## Motivation

Networked real-time applications with arbitrarily-large mutable state (read: games :video_game:) need to efficiently synchronize state from server to client(s). This generally involves tracking state changes and sending only the delta each update interval ("diffing").

### Performance

It is greatly beneficial for performance when data is arranged contiguously so that e.g. SIMD may be leveraged for data transformations.

This library is *fast*. As you can see in [`src/pool.bench.js`](./benchmark/pool.bench.js) (run with `npm test -- --run --project bench`), Propertea beats native JavaScript by 100-1000x transforming contiguous data. Pooled allocations actually beat native after warming the pool.
