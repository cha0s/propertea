import {Property} from './property.js';

export const Diff = Symbol('Diff');
export const MarkClean = Symbol('MarkClean');
export const Set = Symbol('Set');
export const SetWithDefaults = Symbol('SetWithDefaults');
export const ToJSON = Symbol('ToJSON');
export const ToJSONWithoutDefaults = Symbol('ToJSONWithoutDefaults');

export class ProxyProperty extends Property {}
