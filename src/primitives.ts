import * as crunches from 'crunches'

import { Propertea } from './propertea.ts'

abstract class NumberProperty extends Propertea<number> {
  defaultValue = 0
}

abstract class BigNumberProperty extends Propertea<bigint> {
  defaultValue = 0n
}

export class ProperteaBoolean extends Propertea<boolean> {
  codec = crunches.boolean().optional()
  defaultValue = false
}

export class ProperteaInt8 extends NumberProperty {
  byteWidth = 1
  codec = crunches.int8().optional()
}
export class ProperteaInt16 extends NumberProperty {
  byteWidth = 2
  codec = crunches.int16().optional()
}
export class ProperteaInt32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.int32().optional()
}
export class ProperteaInt64 extends BigNumberProperty {
  byteWidth = 8
  codec = crunches.int64().optional()
}

export class ProperteaFloat32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.float32().optional()
}
export class ProperteaFloat64 extends NumberProperty {
  byteWidth = 8
  codec = crunches.float64().optional()
}

export class ProperteaString extends Propertea<string> {
  codec = crunches.string().optional()
  defaultValue = ''
}

export class ProperteaUint8 extends NumberProperty {
  byteWidth = 1
  codec = crunches.uint8().optional()
}
export class ProperteaUint16 extends NumberProperty {
  byteWidth = 2
  codec = crunches.uint16().optional()
}
export class ProperteaUint32 extends NumberProperty {
  byteWidth = 4
  codec = crunches.uint32().optional()
}
export class ProperteaUint64 extends BigNumberProperty {
  byteWidth = 8
  codec = crunches.uint64().optional()
}

export class ProperteaVarint extends NumberProperty {
  codec = crunches.varint().optional()
}
export class ProperteaVaruint extends NumberProperty {
  codec = crunches.varuint().optional()
}

export const boolean = () => new ProperteaBoolean()

export const int8 = () => new ProperteaInt8()
export const int16 = () => new ProperteaInt16()
export const int32 = () => new ProperteaInt32()
export const int64 = () => new ProperteaInt64()

export const float32 = () => new ProperteaFloat32()
export const float64 = () => new ProperteaFloat64()

export const string = () => new ProperteaString()

export const uint8 = () => new ProperteaUint8()
export const uint16 = () => new ProperteaUint16()
export const uint32 = () => new ProperteaUint32()
export const uint64 = () => new ProperteaUint64()

export const varint = () => new ProperteaVarint()
export const varuint = () => new ProperteaVaruint()
