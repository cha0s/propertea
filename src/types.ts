import { CrunchesType } from 'crunches'

export abstract class Property<T, Default = T extends object ? Partial<T> : T> {
  declare _T: T

  byteWidth = 0;
  abstract codec: CrunchesType<unknown>
  defaultValue: Default | undefined
  dirtyByteWidth = 1;

  default(value: Default): this {
    this.defaultValue = value
    return this
  }

  get isMappable() {
    return this.byteWidth > 0;
  }
}
