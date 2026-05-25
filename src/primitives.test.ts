import { expect, test } from 'vitest';

import {
  boolean,
  float32,
  float64,
  int8,
  int16,
  int32,
  string,
  uint8,
  uint16,
  uint32,
  varint,
  varuint,
} from './primitives.ts'

test('boolean', () => {
  expect(boolean().defaultValue).toEqual(false)
  expect(boolean().default(true).defaultValue).toEqual(true)
})

;[
  float32,
  float64,
  int8,
  int16,
  int32,
  uint8,
  uint16,
  uint32,
  varint,
  varuint,
].forEach((propertea) => {
  test(propertea.name, () => {
    expect(propertea().defaultValue).toEqual(0)
    expect(propertea().default(2).defaultValue).toEqual(2)
  })
})

test('string', () => {
  expect(string().defaultValue).toEqual('');
  expect(string().default('foobar').defaultValue).toEqual('foobar');
})
