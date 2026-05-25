import { CrunchesType } from 'crunches'

export abstract class Property<T> {

  byteWidth = 0;
  abstract codec: CrunchesType<unknown>
  defaultValue: T | undefined
  dirtyByteWidth = 1;

  default(value: T): this {
    this.defaultValue = value
    return this
  }

  get isMappable() {
    return this.byteWidth > 0;
  }
}

