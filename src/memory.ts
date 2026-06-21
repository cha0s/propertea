// chrome is stupid. from their own AI:

// Chrome on Linux crashes because V8 (Chrome’s engine) pre-reserves a massive chunk of virtual
// address space (up to 6GB) for each WebAssembly.Memory object to optimize bounds checking.
// Allocating 30+ of these objects causes you to exhaust your process’s virtual memory map
// (typically limited to 8GB on Linux).

// so, until they can get that fixed, we'll have to make our API more complex by making WASM memory
// an option instead of being able to like, y'know, rely on Web specifications.

const PAGE_SIZE = 65536

export interface TrackedMemory<UseWasm extends boolean> {
  memory: UseWasm extends true ? WebAssembly.Memory : Memory
  nextGrow: number
}

export class Memory {

  buffer = new ArrayBuffer(0)

  grow(delta: number) {
    const newSize = this.buffer.byteLength + delta * PAGE_SIZE
    const newBuffer = new ArrayBuffer(newSize)
    // isn't it so great that we have to copy because Chrome SUCKS?
    new Uint8Array(newBuffer)
      .set(new Uint8Array(this.buffer, 0, this.buffer.byteLength), 0)
    this.buffer = newBuffer
  }

}

