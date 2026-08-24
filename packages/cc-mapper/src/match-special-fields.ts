/**
 * match-special-fields — Twin skip, conditional radio, agreement, file, education
 */
import type { FormField, Mapping, MatchHelpers, Profile } from './types.ts';

const FILE_ALIASES: Record<string, string[]> = {
  photo:        ['photo','photograph','passport photo','applicant photo','image','profile photo','customer photograph'],
  signature:    ['signature','sign','applicant signature','digital signature'],
  aadhaar_doc:  ['aadhaar','aadhar','aadhaar document','aadhaar card','uid'],
  pan_doc:      ['pan','pan card','pan document'],
  certificate:  ['certificate','marksheet','mark sheet','passing certificate','degree certificate'],
  resume:       ['resume','cv','curriculum vitae','bio data'],
  passport_doc: ['passport','passport document'],
  license_doc:  ['driving license','licence','dl'],
  utility_bill: ['utility bill','electricity bill','address proof'],
};

const EDU_ALIASES: Record<string, string[]> = {
  board_10th:        ['board_10th','board_matric','board_class10','10th_board','matric_board','boardname_hs','ddl_boardname_hs','matriculation_10th_class_education_board','matriculation_class_education_board','class_10th_education_board','10th_class_education_board','matriculation_education_board','tenth_class_education_board','class_x_education_board','sslc_education_board'],
  board_12th:        ['board_12th','board_inter','board_class12','12th_board','inter_board','intermediate_education_board','class_12th_education_board','12th_class_education_board','twelfth_education_board','class_xii_education_board','plus_two_education_board','hsc_education_board'],
  roll_number_10th:  ['roll_number_10th','roll_no_10th','roll_10th','roll_matric','matric_roll','10th_roll','matriculation_roll_number','matriculation_10th_class_roll_number','class_10_roll_number','tenth_roll_number','sslc_roll_number'],
  roll_number_12th:  ['roll_number_12th','roll_no_12th','roll_12th','roll_inter','inter_roll','12th_roll','intermediate_roll_number','class_12_roll_number','twelfth_roll_number','hsc_roll_number','plus_two_roll_number'],
  passing_year_10th: ['passing_year_10th','year_10th','year_matric','matric_year','10th_year','year_of_passing_10','yearofpassing_hs','ddl_yearofpassing_hs','matriculation_year_of_passing','matriculation_10th_class_year_of_passing','class_10_year_of_passing','tenth_year_of_passing'],
  passing_year_12th: ['passing_year_12th','year_12th','year_inter','inter_year','12th_year','year_of_passing_12','intermediate_year_of_passing','class_12_year_of_passing','twelfth_year_of_passing'],
  marks_10th:        ['marks_10th','percentage_10th','10th_marks','matric_marks','10th_percentage'],
  marks_12th:        ['marks_12th','percentage_12th','12th_marks','inter_marks','12th_percentage'],
  school_name:       ['school_name','school','institution_10','matric_school'],
  college_name:      ['college_name','college','institution_12','inter_college'],
  university_name:   ['university_name','university','institution_grad','college_grad','institution_name'],
  roll_no_graduation:['roll_no_graduation','roll_grad','graduation_roll','degree_roll'],
  year_of_passing:   ['year_of_passing','passing_year','year_pass','year_graduation','grad_year'],
  grade:             ['grade','grade_system','grading','cgpa','gpa','division','class_obtained'],
  degree_name:       ['degree_name','degree','qualification','course_name','programme'],
  marks_graduation:  ['marks_graduation','percentage_grad','grad_marks','grad_percentage'],
};

export function isTwinField(field: FormField, ident: string): boolean {
  const rawLbl = (field.label || '').trim();
  return /^(?:[a-z]\.|\d+\.|\(\w\)|[ixv]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b/i.test(rawLbl)
    || /retype|re_type|reenter|re_enter|^confirm/i.test(ident)
    || !!(field.id   && /^(conf|c_|re_|retype|verify|confirm)/i.test(field.id))
    || !!(field.name && /^(re_|retype|verify|confirm)/i.test(field.name));
}

function tryMatchAgreement(field: FormField, ident: string, matchBy: string, mapping: Mapping): boolean {
  if (field.type !== 'checkbox' && field.type !== 'mat-checkbox') return false;
  const labelText  = (field.label || '').toLowerCase();
  const isAgreement = /\bi\s+(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|consent|terms\s+and\s+conditions|self[\s_-]?declaration|^agree$|^accept$|^confirm$/i.test(labelText)
    || /i_(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|^agree$|^accept$|^confirm$|consent|self_declaration/i.test(ident);
  const fieldNameId = (field.name || '') + ' ' + (field.id || '');
  const isAgreeByName = /\b(agree|accept|consent|confirm|declar|tnc|terms)\b/i.test(fieldNameId);
  if (isAgreement || isAgreeByName) {
    mapping[field.selector] = { value: 'yes', type: field.type, matchBy: matchBy, profileKey: null };
  }
  return true;
}

function tryMatchFile(field: FormField, ident: string, matchBy: string, profile: Profile, mapping: Mapping): boolean {
  if (field.type !== 'file') return false;
  const fileLabelLower = (field.label || '').toLowerCase();
  const fileIdentLower = ident.toLowerCase();
  for (const fk in FILE_ALIASES) {
    if (!profile[fk]) continue;
    const fileHit = FILE_ALIASES[fk].some((a) => {
      return fileLabelLower.includes(a) || (matchBy !== 'label' && fileIdentLower.includes(a.replace(/\s+/g, '_')));
    });
    if (fileHit) {
      mapping[field.selector] = { value: profile[fk] as string | number | boolean, type: 'file', matchBy: matchBy, profileKey: fk };
      break;
    }
  }
  return true;
}

export function isEducationRow(ident: string): boolean {
  const _hasName = ident.includes('name');
  const _isRelativeName = ident.includes('father') || ident.includes('mother') || ident.includes('husband') || ident.includes('spouse') || ident.includes('guardian');
  const isCandidateNameField = _hasName && !_isRelativeName && (ident.includes('candidate') || ident.includes('applicant') || ident.includes('student') || ident.includes('full_name') || ident.includes('your_name') || /^name/.test(ident) || ident.includes('_name_as_per'));
  const isHighestEduField = ident.includes('highest');
  return !isCandidateNameField && !isHighestEduField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));
}

function tryMatchEducation(field: FormField, ident: string, matchBy: string, profile: Profile, mapping: Mapping): boolean {
  if (!isEducationRow(ident)) return false;
  for (const ek in EDU_ALIASES) {
    if (!profile[ek]) continue;
    if (EDU_ALIASES[ek].some((a) => ident.includes(a))) {
      mapping[field.selector] = { value: profile[ek] as string | number | boolean, type: field.type || '', matchBy: matchBy, profileKey: ek };
      break;
    }
  }
  return true;
}

/** Returns true if handled (caller should continue). */
export function tryMatch(
  field: FormField,
  ident: string,
  matchBy: string,
  profile: Profile,
  helpers: MatchHelpers,
  mapping: Mapping,
): boolean {
  if (isTwinField(field, ident)) return true;

  if (field.type === 'radio' || field.type === 'radio-group') {
    const condDecision = helpers.decideConditionalChoice(field, profile);
    if (condDecision) {
      const resolvedCond = helpers.resolveChoiceToOption(field, condDecision, null);
      if (resolvedCond) { mapping[resolvedCond.selector] = resolvedCond.entry; return true; }
    }
  }

  if (tryMatchAgreement(field, ident, matchBy, mapping)) return true;
  if (tryMatchFile(field, ident, matchBy, profile, mapping)) return true;
  if (tryMatchEducation(field, ident, matchBy, profile, mapping)) return true;
  return false;
}

export const CcMatchSpecialFields = {
  tryMatch,
  isTwinField,
  isEducationRow,
};
