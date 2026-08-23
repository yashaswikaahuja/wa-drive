// The service injects its Postgres pool during bootstrap.  Keeping this here
// makes knowledge engines reusable without importing service internals.
export let pool;

export function setPool(nextPool) {
  if (!nextPool || typeof nextPool.query !== 'function') {
    throw new TypeError('svc-knowledge requires a pg-compatible pool');
  }
  pool = nextPool;
}
