/** Re-export cafe health scoring from operations (breaks owner↔operations cycle). */
export {
  computeHealth,
  type HealthSignals,
  type HealthBand,
  type Health,
} from '@cybercontrol/backend-operations';
