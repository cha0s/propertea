import { describe, expect, test } from 'vitest'

import { float32, string, uint32 } from './primitives.ts'
import { Diff, MarkClean, ToJSON } from './proxy.ts'
import { object } from './object.ts'
import { Pool } from './pool.ts'

describe('documentation', () => {

  test('pool (fixed-size)', () => {

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

    const view = new Float32Array(positionPool.data.memory.buffer)
    // equivalent!
    expect(view[0]).to.equal(first.x)
    expect(view[1]).to.equal(first.y)
    expect(view[2]).to.equal(second.x)
    expect(view[3]).to.equal(second.y)

    // proxy -> buffer
    second.x = 123
    expect(view[2]).to.equal(123)
    // buffer -> proxy
    view[3] = 234
    expect(second.y).to.equal(234)

    const another = positionPool.allocate()
    expect(another[Diff]()).to.deep.equal({ x: 0, y: 0 })

    another[MarkClean]()
    expect(another[Diff]()).to.equal(undefined)

    expect(JSON.stringify(another[ToJSON]())).to.equal('{"x":0,"y":0}')

  })

  test('pool (dynamic)', () => {

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

  })

  test('wasm', async () => {

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

  })

})

