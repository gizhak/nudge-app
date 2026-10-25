// @ts-nocheck: a CommonJS stand-in, so a namespace import sees every name
// Web demo only: stands in for phone-only modules (notifications, location, background tasks).
// Any property is a callable no-op. What a call returns can be awaited (it resolves to a value
// that says "granted"), chained with then or catch, or used at once (a listener's remove()).
const value: any = new Proxy(function () {}, {
  get(_t, key) {
    if (key === 'then' || typeof key === 'symbol') return undefined;
    if (key === '__esModule') return true;
    if (key === 'default') return value;
    if (key === 'granted' || key === 'canAskAgain') return true;
    if (key === 'status') return 'granted';
    if (key === 'length') return 0;
    return value;
  },
  apply() {
    return result();
  },
});

function result(): any {
  const p = Promise.resolve(value);
  return new Proxy(function () {}, {
    get(_t, key) {
      if (key === 'then' || key === 'catch' || key === 'finally') return (p as any)[key].bind(p);
      return (value as any)[key];
    },
    apply() {
      return result();
    },
  });
}

module.exports = value;
