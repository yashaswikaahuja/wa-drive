// ═══════════════════════════════════════════════════════════════════════════
// GOAL — what should happen. (Primitive 2 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// Decomposes a page into typed Intents — one per field, plus page-level intents
// (confirm, wait, human-checkpoint). An Intent says WHAT is needed, not HOW.
// The goal type drives which Capability can fulfill it.
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCGoal) return;

  // Map a field's widget type → the abstract goal (user intention).
  function goalForType(type, field) {
    switch (type) {
      case 'radio-group':
      case 'mat-radio':
        return 'choose-one';
      case 'dropdown':
      case 'select':
      case 'mat-select':
      case 'ng-dropdown':
        return 'choose-one';
      case 'checkbox-group':
        return 'choose-many';
      case 'checkbox-agreement':
        return 'confirm';
      case 'mat-checkbox':
      case 'checkbox':
        return 'confirm';
      case 'date':
        return 'provide-date';
      case 'file':
        return 'upload';
      default:
        return 'provide-value';
    }
  }

  // Detect a document requirement from a field/label (for upload intents).
  const DOC_VOCAB = [
    ['photo', /photo|photograph|passport size|passport-size/i],
    ['signature', /signature|sign\b/i],
    ['aadhaar', /aadhaar|aadhar|uid/i],
    ['pan', /\bpan\b/i],
    ['caste_certificate', /caste/i],
    ['income_certificate', /income/i],
    ['domicile_certificate', /domicile|residence/i],
    ['disability_certificate', /disability|pwd|divyang/i],
    ['marksheet', /marksheet|mark sheet|marks|score card/i],
    ['certificate', /certificate|document/i],
  ];
  function documentIntent(label) {
    const l = (label || '').toLowerCase();
    for (const [type, re] of DOC_VOCAB) if (re.test(l)) return type;
    return 'document';
  }

  // Human-checkpoint detection (things the system must NOT auto-do).
  const CHECKPOINT = /captcha|otp|verification code|verify (mobile|email|otp)/i;

  // Build the ordered list of Intents for a page model.
  function deriveIntents(pageModel) {
    const intents = [];
    for (const field of pageModel.fields) {
      const goal = goalForType(field.type, field);
      const isCheckpoint = CHECKPOINT.test(field.label || '');
      intents.push({
        goal: isCheckpoint ? 'human-checkpoint' : goal,
        field,                                  // the WORLD field descriptor
        context: {
          label: field.label,
          type: field.type,
          options: field.options,
          document: goal === 'upload' ? documentIntent(field.label) : null,
          checkpoint: isCheckpoint,
        },
      });
    }
    return intents;
  }

  window.CCGoal = { deriveIntents, goalForType, documentIntent };
})();
