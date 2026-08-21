/**
 * field-aliases — FIELD_ALIASES dict + server merge
 *
 * Provides the canonical alias map for profile key → label patterns,
 * merged with server-synced field mappings from window._ccServerFieldMappings.
 *
 * Public API (on globalThis.CcFieldAliases):
 *   getFieldAliases(serverMappings?) => merged aliases object
 *   FIELD_ALIASES                    => base hardcoded aliases
 *
 * See docs/field-aliases.md for full documentation.
 */
(function (root) {
  'use strict';

  var FIELD_ALIASES = {
    name:           ['candidate_name', 'candidates_name', 'applicant_name', 'applicants_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname', 'pratyashi_ka_naam', 'your_name', 'enter_name'],
    first_name:     ['first_name', 'firstname', 'fname', 'given_name', 'givenname', 'txt_firstname', 'txt_first_name'],
    middle_name:    ['middle_name', 'middlename', 'mname', 'txt_middlename', 'txt_middle_name'],
    last_name:      ['last_name', 'lastname', 'lname', 'surname', 'family_name', 'familyname', 'txt_lastname', 'txt_last_name', 'txt_surname'],
    dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
    father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name', 'fathers_name_and_verify', 'pitaji_ka_naam'],
    mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name', 'mothers_name_and_verify', 'mata_ka_naam'],
    address:        ['address', 'adress', 'permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas', 'full_address', 'addr', 'txt_adress', 'txt_address'],
    mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_mobile_sankhya', 'registered_mobile'],
    phone:          ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'phone_number', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_mobile_sankhya', 'registered_mobile', 'enter_your_mobile_number', 'enter_mobile_number'],
    email:          ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_id_e_mail_a_i_di', 'registered_email', 'enter_your_email_id', 'enter_email_id'],
    email_id:       ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_id_e_mail_a_i_di', 'registered_email', 'enter_your_email_id', 'enter_email_id', 'confirm_your_email_id'],
    aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'aadhar_no', 'identity_card_no', 'enter_identity', 'aadhaar_number_', 'aadhar_card', 'txt_aadhaar', 'txtaadhaar', 'txt_aadhar', 'aadhaar_card_no', 'aadhar_number', 'uid_no', 'aadhar_sankhya', 'aadhaar_sankhya'],
    pan_number:     ['pan_no', 'pan_number', 'pancard', 'pan_card'],
    epic_number:    ['epic_no', 'voter_id', 'epic_number'],
    category:       ['category', 'caste_category', 'varg', 'txt_category', 'ddl_category', 'ddlcategory', 'social_category', 'reservation_category', 'caste'],
    gender:         ['gender', 'sex', 'ling', 'txt_gender', 'ddl_gender', 'rbl_gender'],
    pincode:        ['pincode', 'pin_code', 'postal_code', 'zip_code', 'pin', 'zip', 'pincode_pin_code'],
    state:          ['state_name', 'state_of', 'rajya', 'state', 'home_state', 'permanent_state', 'state_of_residence'],
    district:       ['district_name', 'jila', 'district', 'home_district', 'permanent_district'],
    nationality:    ['nationality', 'rashtriyata', 'citizenship', 'citizen'],
    marital_status: ['marital_status', 'marital', 'vivah', 'married', 'marriage_status', 'ddl_marital'],
    religion:       ['religion', 'dharm', 'dharma', 'ddl_religion', 'txt_religion'],
    domicile_state:      ['domicile', 'domicile_state', 'home_state', 'state_of_domicile'],
    qualification_status:['essential_qualification','have_qualification','possess_qualification','affirmation','qualified'],
    year_of_passing:     ['year_of_passing','passing_year','year_pass','year_graduation'],
    grade:               ['grade','division','class_obtained','cgpa','gpa'],
    highest_education_qualification: ['highest_education','highest_qualification','highest_level_of_education','highest_level_of_educational'],
    degree_name:         ['degree_name','degree','qualification_name','course_name','programme'],
    university_name:     ['university_name','university','institution_name','college_name','college'],
    roll_number:         ['roll_number','roll_no','rollno','rollnumber','roll'],
    board_10th:          ['10th_class','matriculation','class_10','sslc_board','class_x','tenth_class','board_10th','board_10','10th_education','matric_board','matriculation_board'],
    board_12th:          ['12th_class','intermediate','class_12','class_xii','twelfth_class','board_12th','board_12','12th_education','plus_two','plustwo','hsc_board','intermediate_board','inter_board'],
    board_name:          ['education_board','exam_board','university_board'],
    passing_year_10th:   ['10th_passing_year','matriculation_year_of_passing','matric_year','class_10_year','tenth_year_of_passing','sslc_year','year_of_passing_10th','passing_year_10th'],
    passing_year_12th:   ['12th_passing_year','intermediate_year_of_passing','inter_year','class_12_year','twelfth_year_of_passing','hsc_year','year_of_passing_12th','passing_year_12th','plus_two_year'],
    marks_10th:          ['10th_marks','10th_percentage','matriculation_marks','matric_percentage','class_10_marks','tenth_marks','sslc_marks','marks_10th'],
    marks_12th:          ['12th_marks','12th_percentage','intermediate_marks','inter_percentage','class_12_marks','twelfth_marks','hsc_marks','marks_12th','plus_two_marks'],
    school_name:         ['school_name','school','last_school_attended','name_of_school','institute_name','last_institution'],
    registration_number: ['registration_number','reg_number','reg_no','registration_no','enrollment_number','enrolment_number'],
    village:        ['village', 'village_name', 'gram', 'gaon', 'txt_village', 'ddl_village'],
    post_office:    ['post_office', 'post', 'po', 'txt_post', 'post_name'],
    police_station: ['police_station', 'thana', 'ps', 'txt_ps', 'ddl_ps'],
    sub_division:   ['sub_division', 'subdivision', 'sub_div', 'anumandal', 'anchal', 'circle', 'txt_subdiv', 'ddl_subdiv', 'sub-division', 'अनुमंडल'],
    block:          ['block', 'block_name', 'taluka', 'tehsil', 'prakhnd', 'txt_block', 'ddl_block', 'प्रखंड'],
    house_no:       ['house_no', 'house_number', 'house', 'flat_no', 'door_no', 'txt_house'],
    street:         ['street', 'street_name', 'road', 'lane', 'txt_street'],
  };

  /**
   * Returns FIELD_ALIASES merged with server-synced mappings.
   * Server patterns augment (or create) the alias entry — never replace entirely.
   *
   * @param {Array} [serverMappings] — array of { semantic_key, match_patterns }
   * @returns {object} merged aliases
   */
  function getFieldAliases(serverMappings) {
    var merged = Object.assign({}, FIELD_ALIASES);
    var server = serverMappings || (typeof window !== 'undefined' && window._ccServerFieldMappings) || null;
    if (server && Array.isArray(server)) {
      for (var i = 0; i < server.length; i++) {
        var m = server[i];
        if (!m.semantic_key || !m.match_patterns) continue;
        if (!merged[m.semantic_key]) {
          merged[m.semantic_key] = m.match_patterns.slice();
        } else {
          var existing = new Set(merged[m.semantic_key]);
          for (var j = 0; j < m.match_patterns.length; j++) {
            if (!existing.has(m.match_patterns[j])) merged[m.semantic_key].push(m.match_patterns[j]);
          }
        }
      }
    }
    return merged;
  }

  root.CcFieldAliases = { getFieldAliases: getFieldAliases, FIELD_ALIASES: FIELD_ALIASES };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFieldAliases;
