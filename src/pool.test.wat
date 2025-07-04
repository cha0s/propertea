(module

  (memory $data (import "pool" "data") 0)
  (memory $dirty (import "pool" "dirty") 0)
  (global $length (import "pool" "length") (mut i32))

  (func (export "thisIsAWasmTest") (param $parameter f32)
    ;;
    (local $i i32)
    ;; i = 0
    (local.set $i (i32.const 0))
    ;; while (i < length)
    (loop
      (br_if 1 (i32.ge_u (local.get $i) (global.get $length)))
      ;; data[i] += parameter + i
      (f32.store
        $data
        (i32.mul (local.get $i) (i32.const 4))
        (f32.add
          (f32.load $data (i32.mul (local.get $i) (i32.const 4)))
          (f32.add (local.get $parameter) (f32.convert_i32_u (local.get $i)))
        )
      )
      ;; dirty[i >> 3] |= 1 << (i & 7)
      (i32.store8
        $dirty
        (i32.shr_u (local.get $i) (i32.const 3))
        (i32.or
          (i32.load8_u $dirty (i32.shr_u (local.get $i) (i32.const 3)))
          (i32.shl (i32.const 1) (i32.and (local.get $i) (i32.const 7)))
        )
      )
      ;; i += 1;
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      ;;
      (br 0)
    )
  )
)