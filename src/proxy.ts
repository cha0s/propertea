import { type DeepPartial } from './internal-types.ts';
import { Property } from './types.ts';

export const Diff = Symbol('Propertea.Diff');
export const Instance = Symbol('Propertea.Instance');
export const MarkClean = Symbol('Propertea.MarkClean');
export const Set = Symbol('Propertea.Set');
export const SetWithDefaults = Symbol('Propertea.SetWithDefaults');
export const ToJSON = Symbol('Propertea.ToJSON');
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults');

export interface ProxyClass<T> {
  [Set](value?: DeepPartial<T>): void
  [SetWithDefaults](value?: DeepPartial<T>): void
  [ToJSON](): Record<string, any>
  [ToJSONWithoutDefaults](defaults?: DeepPartial<T>): Record<string, any> | undefined
}

export type ProxyMixed<T, O> = (
  ProxyClass<T> & T & (
    O extends true
      ? {
        [Diff](): Record<string, any> | undefined
        [MarkClean](): void
      }
      : {}
  )
)

export type ProxyMixedCreator<T, O> = new (dataIndex: number) => ProxyMixed<T, O>

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

export abstract class ProxyProperty<T extends object, E extends object = {}> extends Property<T> {
  declare _T: T
  declare _E: E
  abstract concrete<O extends ProxyCreatorConfiguration>(
    configuration: O,
    isRoot: boolean,
  ): ProxyMixedCreator<T & E, HasDirty<O>>
  abstract mapped<O extends ProxyCreatorConfiguration>(
    configuration: O,
    isRoot: boolean,
  ): ProxyMixedCreator<T & E, HasDirty<O>>
}

export type ProxyDecorator<T, E extends object> = (
  C: new (index: number) => T
) => new (index: number) => T & E
