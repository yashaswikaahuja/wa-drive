// ── Derivation layer (runs in page context, before fill) ────────────────────
// Computes profile values that are NOT explicitly stored but are logically
// implied by the data that IS stored. This is the "common sense" pass:
// e.g. if 12th data exists but no graduation data, highest qualification =
// Intermediate — even though no `highest_education_qualification` key exists.
//
// Deterministic and free. Runs before the AI pass so the AI only handles
// genuinely ambiguous fields. Derived values never overwrite real profile data.

function ccHasVal(v) { return v != null && String(v).trim() !== ''; }

// Which education levels does this profile have evidence for?
function ccEducationLevels(p) {
  const grad = ccHasVal(p.university_name) || ccHasVal(p.degree) || ccHasVal(p.passing_year_grad) ||
               ccHasVal(p.roll_number_grad) || ccHasVal(p.percentage_grad) || ccHasVal(p.registration_number_grad) ||
               ccHasVal(p.marks_obtained_grad) || ccHasVal(p.division_grad);
  const twelfth = ccHasVal(p.board_12th) || ccHasVal(p.passing_year_12th) || ccHasVal(p.roll_number_12th) ||
                  ccHasVal(p.percentage_12th) || ccHasVal(p.stream_12th) || ccHasVal(p.marks_obtained_12th) ||
                  ccHasVal(p.school_name_12th) || ccHasVal(p.certificate_number_12th);
  const tenth = ccHasVal(p.board_10th) || ccHasVal(p.passing_year_10th) || ccHasVal(p.roll_number_10th) ||
                ccHasVal(p.percentage_10th) || ccHasVal(p.marks_obtained_10th) || ccHasVal(p.certificate_number_10th);
  return { grad, twelfth, tenth };
}

// Age from a DD/MM/YYYY, DD-MM-YYYY or YYYY-MM-DD date string.
function ccAgeFromDob(dob) {
  if (!ccHasVal(dob)) return null;
  const m = String(dob).match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
  if (!m) return null;
  let y, mo, d;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else { d = +m[1]; mo = +m[2]; y = +m[3]; }
  if (!y || y < 1900 || y > 2100) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const mDiff = (today.getMonth() + 1) - mo;
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 && age < 120 ? String(age) : null;
}

/**
 * Returns a NEW profile object with derived keys added.
 * Existing (real) values always win — derivation only fills gaps.
 * Also returns `_derived` listing which keys were inferred (for transparency).
 */
function ccDeriveProfile(profile) {
  const p = Object.assign({}, profile || {});
  const derived = [];
  const set = (key, val) => {
    if (!ccHasVal(val)) return;
    if (ccHasVal(p[key])) return;      // never overwrite real data
    p[key] = String(val);
    derived.push(key);
  };

  const edu = ccEducationLevels(p);

  // ── Highest qualification ────────────────────────────────────────────────
  // The gap that made SSC skip field 11: no explicit key, but implied by data.
  if (edu.grad) set('highest_education_qualification', 'Graduation');
  else if (edu.twelfth) set('highest_education_qualification', 'Intermediate');
  else if (edu.tenth) set('highest_education_qualification', 'Matriculation');

  // Graduate yes/no + pursuing status
  set('is_graduate', edu.grad ? 'Yes' : 'No');
  if (edu.twelfth && !edu.grad) set('qualification_status', 'Passed');

  // ── Education aliases ────────────────────────────────────────────────────
  // Forms often say just "Roll Number" / "Board" / "Year of Passing" in a
  // matriculation context. Prefer 10th, then 12th, then graduation.
  set('roll_number', p.roll_number_10th || p.roll_number_12th || p.roll_number_grad);
  set('board_name', p.board_10th || p.board_12th);
  set('year_of_passing', p.passing_year_10th || p.passing_year_12th || p.passing_year_grad);
  set('percentage', p.percentage_10th || p.percentage_12th || p.percentage_grad);
  set('division', p.division_10th || p.division_12th || p.division_grad);
  set('school_name', p.school_name || p.school_name_12th);

  // ── Age ──────────────────────────────────────────────────────────────────
  set('age', ccAgeFromDob(p.dob));

  // ── Eligibility flags (drive conditional radio/checkbox rules) ───────────
  set('is_pwd', ccHasVal(p.disability_certificate) ? 'Yes' : 'No');
  if (ccHasVal(p.occupation)) {
    set('ex_serviceman', /ex.?serv/i.test(p.occupation) ? 'Yes' : 'No');
  }
  if (ccHasVal(p.category)) {
    const gen = /^gen(eral)?$/i.test(String(p.category).trim());
    set('is_reserved_category', gen ? 'No' : 'Yes');
  }

  // ── Name parts ───────────────────────────────────────────────────────────
  if (ccHasVal(p.name)) {
    const parts = String(p.name).trim().split(/\s+/);
    set('first_name', parts[0]);
    if (parts.length >= 2) set('last_name', parts[parts.length - 1]);
    if (parts.length >= 3) set('middle_name', parts.slice(1, -1).join(' '));
  }

  // ── Address aliases ──────────────────────────────────────────────────────
  set('permanent_address', p.address);
  set('domicile_state', p.state);
  set('city', p.city || p.village || p.district);

  // ── Safe defaults for Indian government forms ───────────────────────────
  set('nationality', 'Indian');

  p._derived = derived;
  return p;
}
