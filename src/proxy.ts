import { Propertea } from './propertea.ts';

export const DataOffset = Symbol('Propertea.DataOffset');
export const Diff = Symbol('Propertea.Diff');
export const DirtyOffset = Symbol('Propertea.DirtyOffset');
export const Instance = Symbol('Propertea.Instance');
export const MarkClean = Symbol('Propertea.MarkClean');
export const Set = Symbol('Propertea.Set');
export const Initialize = Symbol('Propertea.Initialize');
export const ToJSON = Symbol('Propertea.ToJSON');
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults');

export interface ProxyClass {
  [DataOffset]: number
  [Diff](): any
  [DirtyOffset]: number
  [Set](value?: never): void
  [Initialize](value?: never): void
  [MarkClean](): void
  [ToJSON](): Record<string, any>
  [ToJSONWithoutDefaults](defaults?: never): Record<string, any> | undefined
}

export type ProxyMixed<
  T,
> = (
  & ProxyClass
  & T
)

export type ProxyMixedCreator<
  T,
> = (
  new (indexOrDataOffset: number, dirtyOffset?: number) => ProxyMixed<T>
)

export type ProxyOnDirtyCallback = (bit: number, proxy?: any) => void

export type ProxyCreatorConcreteConfiguration = {
  dirty: Uint8Array
  onDirty?: ProxyOnDirtyCallback
}

export type ProxyCreatorMappedConfiguration = {
  data: DataView
  dirty: Uint8Array
  onDirty?: ProxyOnDirtyCallback
}

export abstract class ProxyProperty<
  T extends object,
  Extension extends object = {},
  Default = Partial<T>,
> extends Propertea<T, Default> {

  declare _T: T
  declare _E: Extension

  abstract concrete(
    configuration: ProxyCreatorConcreteConfiguration,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension>

  abstract mapped(
    configuration: ProxyCreatorMappedConfiguration,
    isRoot: boolean,
  ): ProxyMixedCreator<T & Extension>

}

export type ProxyDecorator<T, E extends object> = (
  C: new (index: number) => T
) => new (index: number) => T & E
