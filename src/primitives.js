import {Codecs} from 'crunches';

import {Property} from './property.js';
import {registry} from './register.js';

// boolean
registry.bool = class extends Property {
  codec = new Codecs.bool();
  dataWidth = 1;
  get defaultValue() {
    return super.defaultValue ?? false;
  }
}

// regular number types
class Number extends Property {
  get defaultValue() {
    return super.defaultValue ?? 0;
  }
}
['float32', 'float64', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32'].forEach((type) => {
  const codec = new Codecs[type]();
  registry[type] = class extends Number {
    codec = codec;
    dataWidth = codec.size();
  };
});
['varint', 'varuint'].forEach((type) => {
  registry[type] = class extends Number {
    codec = new Codecs[type]();
  };
});

// 64-bit numbers
class BigNumber extends Property {
  get defaultValue() {
    return super.defaultValue ?? 0n;
  }
}
['int64', 'uint64'].forEach((type) => {
  const codec = new Codecs[type]();
  registry[type] = class extends BigNumber {
    codec = codec;
    dataWidth = codec.size();
  };
});

// string
registry.string = class extends Property {
  codec = new Codecs.string();
  get defaultValue() {
    return super.defaultValue ?? '';
  }
}
