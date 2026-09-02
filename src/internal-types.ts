import type { Propertea } from './propertea.ts'
import type { ProxyMixed, ProxyPropertea } from './proxy.ts'

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T

/**
 * The value type of a `Propertea`: the proxy shape for proxy types, otherwise
 * the plain stored value.
 */
export type ProperteaValue<P extends Propertea<unknown>> = P extends ProxyPropertea<any>
  ? ProxyMixed<P['_T'] & P['_E']>
  : P['_T']
