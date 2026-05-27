import { Property } from './types.ts';

export const Diff = Symbol('Propertea.Diff');
export const Instance = Symbol('Propertea.Instance');
export const MarkClean = Symbol('Propertea.MarkClean');
export const Set = Symbol('Propertea.Set');
export const SetWithDefaults = Symbol('Propertea.SetWithDefaults');
export const ToJSON = Symbol('Propertea.ToJSON');
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults');

export interface ProxyClass {
  [Set](value?: never): void
  [SetWithDefaults](value?: never): void
  [ToJSON](): Record<string, any>
  [ToJSONWithoutDefaults](defaults?: never): Record<string, any> | undefined
}

export type ProxyMixed<
  T,
  HasDirty,
> = (
  & ProxyClass
  & T
  & (
    HasDirty extends true
      ? {
        [Diff](): Record<string, any> | undefined
        [MarkClean](): void
      }
      : {}
  )
)

export type ProxyMixedCreator<
  T,
  HasDirty,
> = (
  new (dataIndex: number) => ProxyMixed<T, HasDirty>
)

export type ProxyDataConfiguration = {
  data: DataView
}

export type ProxyOnDirtyCallback = (bit: number, proxy?: any) => void

export type ProxyDirtyConfiguration = {
  dirty: Uint8Array
  onDirty: boolean | ProxyOnDirtyCallback
}

export type ProxyCreatorConfiguration = Partial<ProxyDirtyConfiguration> & Partial<ProxyDataConfiguration>

export type HasDirty<O extends ProxyCreatorConfiguration> = (
  O extends { onDirty: false } ? false : true
)

export abstract class ProxyProperty<
  T extends object,
  Extension extends object = {}
> extends Property<T> {
  declare _T: T
  declare _E: Extension
  abstract concrete<O extends ProxyCreatorConfiguration>(
    configuration: O,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension, HasDirty<O>>
  abstract mapped<O extends ProxyCreatorConfiguration>(
    configuration: O,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension, HasDirty<O>>
}

export type ProxyDecorator<T, E extends object> = (
  C: new (index: number) => T
) => new (index: number) => T & E
