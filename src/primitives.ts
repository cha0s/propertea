import * as crunches from 'crunches'

import { Propertea } from './propertea.ts'

/**
 * Base class for a numeric Propertea.
 */
abstract class NumberProperty extends Propertea<number> {
  defaultValue = 0
}

/**
 * Base class for a BigInt Propertea.
 */
abstract class BigNumberProperty extends Propertea<bigint> {
  defaultValue = 0n
}

/**
 * Base class for a boolean Propertea.
 */
export class ProperteaBoolean extends Propertea<boolean> {
  codec = crunches.boolean().optional()
  defaultValue = false
}

/**
 * 8-bit signed integer Propertea.
 */
export class ProperteaInt8 extends NumberProperty {
  byteWidth = 1
  codec = crunches.int8().optional()
}

/**
 * 16-bit signed integer Propertea.
 */
export class ProperteaInt16 extends NumberProperty {
  byteWidth = 2
  codec = crunches.int16().optional()
}

/**
 * 32-bit signed integer Propertea.
 */
export class ProperteaInt32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.int32().optional()
}

/**
 * 64-bit signed integer Propertea.
 */
export class ProperteaInt64 extends BigNumberProperty {
  byteWidth = 8
  codec = crunches.int64().optional()
}

/**
 * 32-bit single-precision floating point Propertea.
 */
export class ProperteaFloat32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.float32().optional()
}

/**
 * 64-bit double-precision floating point Propertea.
 */
export class ProperteaFloat64 extends NumberProperty {
  byteWidth = 8
  codec = crunches.float64().optional()
}

/**
 * String Propertea.
 */
export class ProperteaString extends Propertea<string> {
  codec = crunches.string().optional()
  defaultValue = ''
}

/**
 * 8-bit unsigned integer Propertea.
 */
export class ProperteaUint8 extends NumberProperty {
  byteWidth = 1
  codec = crunches.uint8().optional()
}

/**
 * 16-bit unsigned integer Propertea.
 */
export class ProperteaUint16 extends NumberProperty {
  byteWidth = 2
  codec = crunches.uint16().optional()
}

/**
 * 32-bit unsigned integer Propertea.
 */
export class ProperteaUint32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.uint32().optional()
}

/**
 * 64-bit unsigned integer Propertea.
 */
export class ProperteaUint64 extends BigNumberProperty {
  byteWidth = 8
  codec = crunches.uint64().optional()
}

/**
 * Signed varint Propertea.
 */
export class ProperteaVarint extends NumberProperty {
  codec = crunches.varint().optional()
}

/**
 * Unsigned varint Propertea.
 */
export class ProperteaVaruint extends NumberProperty {
  codec = crunches.varuint().optional()
}

/**
 * Create a boolean Propertea.
 */
export const boolean = () => new ProperteaBoolean()

/**
 * Create an 8-bit signed integer Propertea.
 */
export const int8 = () => new ProperteaInt8()

/**
 * Create a 16-bit signed integer Propertea.
 */
export const int16 = () => new ProperteaInt16()

/**
 * Create a 32-bit signed integer Propertea.
 */
export const int32 = () => new ProperteaInt32()

/**
 * Create a 64-bit signed integer Propertea.
 */
export const int64 = () => new ProperteaInt64()

/**
 * Create a 32-bit single-precision floating point Propertea.
 */
export const float32 = () => new ProperteaFloat32()

/**
 * Create a 64-bit double-precision floating point Propertea.
 */
export const float64 = () => new ProperteaFloat64()

/**
 * Create a string Propertea.
 */
export const string = () => new ProperteaString()

/**
 * Create an 8-bit unsigned integer Propertea.
 */
export const uint8 = () => new ProperteaUint8()

/**
 * Create a 16-bit unsigned integer Propertea.
 */
export const uint16 = () => new ProperteaUint16()

/**
 * Create a 32-bit unsigned integer Propertea.
 */
export const uint32 = () => new ProperteaUint32()

/**
 * Create a 64-bit unsigned integer Propertea.
 */
export const uint64 = () => new ProperteaUint64()

/**
 * Create a signed varint Propertea.
 */
export const varint = () => new ProperteaVarint()

/**
 * Create an unsigned varint Propertea.
 */
export const varuint = () => new ProperteaVaruint()
