// Avoid `export *` collisions between knowledge-store / scope-resolver / validation-engine.
export {
  ensureKnowledgeSchema,
  validateRecord,
  create,
  getById,
  getByLineage,
  update,
  deprecate,
  remove,
  query,
  resolve,
} from './knowledge-store.js';
export * from './knowledge-versioning.js';
export * from './validation-engine.js';
export {
  resolveOne,
  resolveAll,
  resolveWithInheritance,
  rankCandidates,
  computeInheritance,
  buildReason,
  SCOPE_PRIORITY,
  STATUS_PRIORITY,
} from './scope-resolver.js';
export * from './mapping-observations.js';
export { setPool } from './db-adapter.js';
export { setStoreAdapter } from './store-adapter.js';
export * as knowledgeStore from './knowledge-store.js';
export * as knowledgeVersioning from './knowledge-versioning.js';
export * as validationEngine from './validation-engine.js';
export * as scopeResolver from './scope-resolver.js';
export * as mappingObservations from './mapping-observations.js';
