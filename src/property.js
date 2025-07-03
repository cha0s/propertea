export class Property {

  codec = null;
  dataWidth = 0;
  dirtyWidth = 1;

  constructor(blueprint = {}) {
    this.blueprint = blueprint;
  }

  get defaultValue() {
    return this.blueprint.defaultValue;
  }
}
