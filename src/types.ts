import { CrunchesType } from 'crunches'

export abstract class Property<T> {
  declare _T: T

  byteWidth = 0;
  abstract codec: CrunchesType<unknown>
  defaultValue: Partial<T> | undefined
  dirtyByteWidth = 1;

  default(value: Partial<T>): this {
    this.defaultValue = value
    return this
  }

  get isMappable() {
    return this.byteWidth > 0;
  }
}
