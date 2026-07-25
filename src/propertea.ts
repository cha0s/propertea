import { CrunchesOptional, CrunchesType } from 'crunches'

/**
 * Base class of all Propertea objects.
 */
export abstract class Propertea<T, Default = T extends object ? Partial<T> : T> {

  /**
   * The inner type of the Propertea.
   */
  declare _T: T

  /**
   * The width of this type in bytes.
   */
  byteWidth = 0

  /**
   * The `crunches` codec associated with this Propertea.
   */
  abstract codec: CrunchesOptional<CrunchesType<unknown>>

  /**
   * The default value of this Propertea if not specified.
   */
  defaultValue: Default | undefined

  /**
   * Bit width of the dirty flags for this Propertea.
   */
  dirtyBitWidth = 1

  /**
   * Specify the default value of this Propertea.
   *
   * @param value The default value.
   * @returns `this` for chaining.
   */
  default(value: Default): this {
    this.defaultValue = value
    return this
  }

  /**
   * Is this Propertea mappable directly to memory?
   */
  get isMappable() {
    return this.byteWidth > 0
  }

}
