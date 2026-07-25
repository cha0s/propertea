import { Propertea } from './propertea.ts'

export const DataOffset = Symbol('Propertea.DataOffset')
export const Diff = Symbol('Propertea.Diff')
export const DirtyOffset = Symbol('Propertea.DirtyOffset')
export const Instance = Symbol('Propertea.Instance')
export const MarkClean = Symbol('Propertea.MarkClean')
export const Set = Symbol('Propertea.Set')
export const Initialize = Symbol('Propertea.Initialize')
export const ToJSON = Symbol('Propertea.ToJSON')
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults')

/**
 * Base interface implemented by all ProxyPropertea values.
 */
export interface ProxyClass {
  /**
   * Offset in the data buffer.
   */
  [DataOffset]: number
  /**
   * Offset in the dirty buffer.
   */
  [DirtyOffset]: number
  /**
   * The state diff since the last time this proxy was marked clean.
   */
  [Diff](): unknown
  /**
   * Set a value into this proxy. Usually merges with existing state from a diff.
   * @param value The value to set.
   */
  [Set](value?: unknown): void
  /**
   * Initialize this proxy with a value. Overwrites existing state.
   * @param value The value to initialize with.
   */
  [Initialize](value?: unknown): void
  /**
   * Mark this proxy clean.
   */
  [MarkClean](): void
  /**
   * Output state as JSON.
   */
  [ToJSON](): unknown
  /**
   * Output state as JSON, excluding any default values.
   * @param defaults The default values to exclude.
   */
  [ToJSONWithoutDefaults](defaults?: unknown): unknown | undefined
}

/**
 * Mix in proxy class with a type.
 */
export type ProxyMixed<T> = ProxyClass & T

/**
 * Proxy creator return type.
 */
export interface ProxyConstructorMixed<T> {
  new (indexOrDataOffset: number, dirtyOffset?: number): ProxyMixed<T>
  markClean: () => void
}

/**
 * Function to decorate a mixed proxy object.
 */
export type ProxyDecorator<T, E extends object> = (
  C: ProxyConstructorMixed<T>
) => ProxyConstructorMixed<T & E>

/**
 * Callback function passed to proxy creators for dirty notifications.
 */
export type ProxyOnDirtyCallback = (bit: number, proxy?: any) => void

export interface ProxyConstructorConcreteConfiguration {
  /**
   * Dirty buffer.
   */
  dirty: Uint8Array
  /**
   * Dirty notification callback.
   */
  onDirty?: ProxyOnDirtyCallback
}

export interface ProxyConstructorMappedConfiguration {
  /**
   * Data buffer.
   */
  data: DataView
  /**
   * Dirty buffer.
   */
  dirty: Uint8Array
  /**
   * Dirty notification callback.
   */
  onDirty?: ProxyOnDirtyCallback
}

/**
 * Base class of all Proxy Propertea objects.
 */
export abstract class ProxyPropertea<
  T extends object,
  Extension extends object = {},
  Default = Partial<T>,
> extends Propertea<T, Default> {

  declare _T: T
  declare _E: Extension

  /**
   * Configure a concrete proxy constructor.
   * @param configuration Constructor configuration.
   * @param configuration.dirty Dirty buffer.
   * @param configuration.onDirty Dirty notification callback.
   * @param isRoot Is this the root proxy? Advanced use only.
   */
  abstract concrete(
    configuration: ProxyConstructorConcreteConfiguration,
    isRoot: boolean,
  ): ProxyConstructorMixed<T & Extension>

  /**
   * Configure a mapped proxy constructor.
   * @param configuration Constructor configuration.
   * @param configuration.data Data buffer.
   * @param configuration.dirty Dirty buffer.
   * @param configuration.onDirty Dirty notification callback.
   * @param isRoot Is this the root proxy? Advanced use only.
   */
  abstract mapped(
    configuration: ProxyConstructorMappedConfiguration,
    isRoot: boolean,
  ): ProxyConstructorMixed<T & Extension>

}
