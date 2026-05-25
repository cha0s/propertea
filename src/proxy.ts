import { Property } from '#types';

export const Diff = Symbol('Propertea.Diff');
export const Instance = Symbol('Propertea.Instance');
export const MarkClean = Symbol('Propertea.MarkClean');
export const Set = Symbol('Propertea.Set');
export const SetWithDefaults = Symbol('Propertea.SetWithDefaults');
export const ToJSON = Symbol('Propertea.ToJSON');
export const ToJSONWithoutDefaults = Symbol('Propertea.ToJSONWithoutDefaults');

export abstract class ProxyProperty<Output> extends Property<Output> {
  // abstract [Set](): object
  // abstract [SetWithDefaults](): object
  // abstract [ToJSON](): object
  // abstract [ToJSONWithoutDefaults](): object
  // abstract [Diff]?(): object
  // abstract [MarkClean]?(): object


  abstract concrete(isRoot: boolean): any
  // map(configuration = {}) {
  //   return this.concrete(configuration);
  // }
}
