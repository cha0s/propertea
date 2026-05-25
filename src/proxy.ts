import { Property } from '#types';

export const Diff = Symbol('Propertea.Diff');
export const Instance = Symbol('Propertea.Instance');
export const MarkClean = Symbol('Propertea.MarkClean');
export const Set = Symbol('Propertea.Set');
export const SetWithDefaults = Symbol('Propertea.SetWithDefaults');
export const ToJSON = Symbol('Propertea.ToJSON');
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults');

export type ProxyDirtyConfiguration = {
  dirty: Uint8Array
  onDirty: (bit?: number, proxy?: any) => void
}

export type ProxyDataConfiguration = {
  data: DataView
}

export type ProxyConcreteConfiguration = Partial<ProxyDirtyConfiguration>
export type ProxyMappedConfiguration = Partial<ProxyDirtyConfiguration> & ProxyDataConfiguration

export abstract class ProxyProperty<Output> extends Property<Output> {
  // abstract [Set](): object
  // abstract [SetWithDefaults](): object
  // abstract [ToJSON](): object
  // abstract [ToJSONWithoutDefaults](): object
  // abstract [Diff]?(): object
  // abstract [MarkClean]?(): object


  abstract concrete(configuration: ProxyConcreteConfiguration, isRoot: boolean): any
  abstract mapped(configuration: ProxyMappedConfiguration, isRoot: boolean): any
  // map(configuration = {}) {
  //   return this.concrete(configuration);
  // }
}
