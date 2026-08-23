let adapter;

export function setStoreAdapter(nextAdapter) {
  if (!nextAdapter || typeof nextAdapter.mutateDoc !== 'function' || !nextAdapter.KEYS) {
    throw new TypeError('svc-knowledge requires mutateDoc and KEYS');
  }
  adapter = nextAdapter;
}

export function mutateDoc(...args) {
  if (!adapter) throw new Error('svc-knowledge store adapter has not been configured');
  return adapter.mutateDoc(...args);
}

export function getKeys() {
  if (!adapter) throw new Error('svc-knowledge store adapter has not been configured');
  return adapter.KEYS;
}
