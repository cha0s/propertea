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
  [DataOffset]: number
  [Diff](): unknown
  [DirtyOffset]: number
  [Set](value?: unknown): void
  [Initialize](value?: unknown): void
  [MarkClean](): void
  [ToJSON](): unknown
  [ToJSONWithoutDefaults](defaults?: unknown): unknown | undefined
}

/**
 * Mix in proxy class with a type.
 */
export type ProxyMixed<T> = ProxyClass & T

/**
 * Proxy creator return type.
 */
export type ProxyMixedCreator<T> = (
  (new (indexOrDataOffset: number, dirtyOffset?: number) => ProxyMixed<T>)
  & { markClean: () => void }
)

/**
 * Callback function passed to proxy creators for dirty notifications.
 */
export type ProxyOnDirtyCallback = (bit: number, proxy?: any) => void

export type ProxyCreatorConcreteConfiguration = {
  /**
   * Dirty buffer.
   */
  dirty: Uint8Array
  onDirty?: ProxyOnDirtyCallback
}

export type ProxyCreatorMappedConfiguration = {
  /**
   * Data buffer.
   */
  data: DataView
  /**
   * Dirty buffer.
   */
  dirty: Uint8Array
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
   * Configure a concrete proxy creator.
   * @param configuration Buffers and optional dirty notification callback
   * @param isRoot Is this the root proxy? Internal use.
   */
  abstract concrete(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension>

  /**
   * Configure a mapped proxy creator.
   * @param configuration Buffers and optional dirty notification callback
   * @param isRoot Is this the root proxy? Internal use.
   */
  abstract mapped(
    configuration: ProxyCreatorMappedConfiguration,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension>

}

/**
 * Function to decorate a mixed proxy object.
 */
export type ProxyDecorator<T, E extends object> = (
  C: new (index: number) => ProxyMixed<T>
) => new (index: number) => ProxyMixed<T> & E
