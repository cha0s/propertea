import { test } from 'vitest'

import { object } from '../src/object.ts'
import { Pool } from '../src/pool.ts'
import { float32 } from '../src/primitives.ts'

import buffer from '../src/pool.test.wat?multi_memory'

const N = 50_000

const pool = new Pool(object({
  x: object({
    y: object({
      z: float32().default(123),
    }),
  }),
}), { useWasm: true })

type TestPool = typeof pool

interface WasmTestExports extends Record<string, any> {
  thisIsAWasmTest: (arg: number) => void
}

const exports = await WebAssembly.instantiate(buffer, {pool: pool.wasmImports()})
  .then(({instance: {exports}}) => exports as WasmTestExports)

function create() {
  for (let i = 0; i < N; ++i) {
    new Struct(i)
  }
}

class Y {
  z = 123
}
class X {
  y: Y
  constructor() {
    this.y = new Y()
  }
}
class P {
  x: X
  constructor() {
    this.x = new X()
  }
}

function createNative() {
  for (let i = 0; i < N; ++i) {
    new P()
  }
}

const Concrete = pool.property.concrete({ dirty: new Uint8Array(Math.ceil(N / 8)) })
function createConcrete() {
  for (let i = 0; i < N; ++i) {
    new Concrete(i)
  }
}

function allocate() {
  for (let i = 0; i < N; ++i) {
    pool.allocate()
  }
}

function allocateNative() {
  const proxies = []
  for (let i = 0; i < N; ++i) {
    proxies.push(new P())
  }
}

function setNative(setting: P[], r: number) {
  for (let i = 0; i < N; ++i) {
    setting[i].x.y.z += i + r
  }
}

function setAllocated(setting: P[], r: number) {
  for (let i = 0; i < N; ++i) {
    setting[i].x.y.z += i + r
  }
}

let start: number
function measure(label: string) {
  const ms = performance.now() - start
  console.log(
    `\x1b[33m${ms.toFixed(2).padStart(7, ' ')}\x1b[0mms`,
    `(\x1b[33m${(ms / N * 1000).toFixed(4)}\x1b[0mμs/op)`,
    `(\x1b[33m${Math.floor(N * (16.6 / ms)).toLocaleString().padStart(10, ' ')}\x1b[0m/tick)`,
    'to',
    label,
  )
}

function clear(pool: TestPool) {
  for (const proxy of pool.proxies) {
    if (proxy) {
      pool.free(proxy)
    }
  }
  pool.views.dirty.fill(0)
  pool.length.value = 0
  pool.freeList = []
  pool.proxies = []
}

function warm(f: Function) {
  for (let i = 0; i < 5_000_000 / N; ++i) {
    f()
  }
  global.gc?.()
}

const Struct = pool.property.mapped({
  data: new DataView(new ArrayBuffer(N * pool.property.byteWidth)),
  dirty: new Uint8Array(1),
})

test('pool', () => {
  const label = `pool (N=${N.toLocaleString()})`
  console.log(label)
  console.log('='.repeat(label.length + 1))

  warm(create)
  start = performance.now()
  create()
  measure('create')

  warm(createNative)
  start = performance.now()
  createNative()
  measure('create native')

  warm(createConcrete)
  start = performance.now()
  createConcrete()
  measure('create concrete')

  warm(() => {
    allocate()
    clear(pool)
  })
  start = performance.now()
  allocate()
  measure('allocate')
  clear(pool)

  warm(() => {
    allocate()
    for (const proxy of pool.proxies) {
      if (proxy) {
        pool.free(proxy)
      }
    }
  })
  start = performance.now()
  allocate()
  measure('\x1b[93mallocate (cached)\x1b[0m')
  clear(pool)

  warm(allocateNative)
  start = performance.now()
  allocateNative()
  measure('allocate native')

  const r = Math.random()

  {
    const setting = Array(N)
    for (let i = 0; i < N; ++i) {
      setting[i] = new P()
    }
    warm(() => setNative(setting, r))
    start = performance.now()
    setNative(setting, r)
    measure('set native')
  }

  {
    const setting = Array(N)
    for (let i = 0; i < N; ++i) {
      setting[i] = pool.allocate()
    }
    warm(() => {
      setAllocated(setting, r)
      pool.views.dirty.fill(0)
    })
    start = performance.now()
    setAllocated(setting, r)
    pool.views.dirty.fill(0)
    measure('set allocated (with dirty tracking)')
    clear(pool)
  }

  {
    const setting = Array(N)
    for (let i = 0; i < N; ++i) {
      setting[i] = pool.allocate()
    }
    warm(() => {
      exports.thisIsAWasmTest(r)
      pool.views.dirty.fill(0)
    })
    start = performance.now()
    exports.thisIsAWasmTest(r)
    pool.views.dirty.fill(0)
    measure('\x1b[93mset allocated (buffer with dirty tracking)\x1b[0m')
    clear(pool)
  }
}, 10_000)
