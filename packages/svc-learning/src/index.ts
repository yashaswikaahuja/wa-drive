export * from './learning-engine.js';
export {
  CONFIDENCE_DIMENSIONS,
  recordSuccessfulExecution as recordConfidenceSuccessfulExecution,
  recordCorrection,
  recordExecutionFailure,
  recordVerificationSuccess,
  recordVerificationFailure,
  getPromotionDecision,
  getDemotionDecision,
  getConfidenceState,
  checkBlockers,
  resetState,
  initializeFromRecord,
  MIN_EXECUTIONS_FOR_PROMOTION,
  MIN_OPERATORS_FOR_CONSISTENCY,
  CONSECUTIVE_CORRECTIONS_DEMOTION,
  AI_PROMOTION_REQUIREMENTS,
  LIFECYCLE_REQUIREMENTS,
  computeAggregateConfidence,
} from './confidence-manager.js';
export * from './generalization-engine.js';
export * as learningEngine from './learning-engine.js';
export * as confidenceManager from './confidence-manager.js';
export * as generalizationEngine from './generalization-engine.js';
