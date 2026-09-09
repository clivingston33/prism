// In-memory electron-store stub: same get/set contract the production
// store module uses, with constructor defaults. No disk, no Electron.
export default class Store {
  constructor(options = {}) {
    this.data = JSON.parse(JSON.stringify(options.defaults ?? {}));
  }

  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
  }
}
