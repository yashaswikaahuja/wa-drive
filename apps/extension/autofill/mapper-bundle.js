/**
 * AUTO-GENERATED from @cc/mapper (TypeScript + esbuild IIFE).
 * Rebuild: pnpm --filter cybercontrol-extension build
 */
"use strict";
(() => {
  // ../../packages/cc-mapper/src/field-aliases.ts
  var FIELD_ALIASES = {
    name: ["candidate_name", "candidates_name", "applicant_name", "applicants_name", "student_name", "full_name", "fullname", "naam", "name", "applicant_name_english", "name_english", "name_in_english", "txt_candidate_name", "txt_name", "txtcandidatename", "txtname", "pratyashi_ka_naam", "your_name", "enter_name"],
    first_name: ["first_name", "firstname", "fname", "given_name", "givenname", "txt_firstname", "txt_first_name"],
    middle_name: ["middle_name", "middlename", "mname", "txt_middlename", "txt_middle_name"],
    last_name: ["last_name", "lastname", "lname", "surname", "family_name", "familyname", "txt_lastname", "txt_last_name", "txt_surname"],
    dob: ["dob", "date_of_birth", "dateofbirth", "birth_date", "janm_tithi", "janm", "birthdate", "date_of_birth_dd_mm_yyyy", "janm_tithi_", "txt_dob", "txtdob", "txt_date_of_birth"],
    father_name: ["father_name", "fathername", "fathers_name", "father_s_name", "pita_ka_naam", "pita_naam", "father", "father_husband_name", "pita_pati_ka_naam", "txt_father", "txtfather", "txt_father_name", "fathers_name_and_verify", "pitaji_ka_naam"],
    mother_name: ["mother_name", "mothername", "mothers_name", "mother_s_name", "mata_ka_naam", "mata_naam", "mother", "txt_mother", "txtmother", "txt_mother_name", "mothers_name_and_verify", "mata_ka_naam"],
    address: ["address", "adress", "permanent_address", "correspondence_address", "residential_address", "pata", "niwas", "full_address", "addr", "txt_adress", "txt_address"],
    mobile: ["mobile_no", "mobile_number", "phone_no", "contact_no", "mo_no", "sampark", "mobile", "phone", "mobile_no_", "sampark_no", "txt_mobile", "txtmobile", "txt_mobile_no", "mobile_no_mobile_sankhya", "registered_mobile"],
    phone: ["mobile_no", "mobile_number", "phone_no", "contact_no", "mo_no", "sampark", "mobile", "phone", "phone_number", "mobile_no_", "sampark_no", "txt_mobile", "txtmobile", "txt_mobile_no", "mobile_no_mobile_sankhya", "registered_mobile", "enter_your_mobile_number", "enter_mobile_number"],
    email: ["email_address", "email_id", "emailid", "email_add", "email", "email-id", "txt_email", "txtemail", "txt_email_id", "email_id_e_mail_a_i_di", "registered_email", "enter_your_email_id", "enter_email_id"],
    email_id: ["email_address", "email_id", "emailid", "email_add", "email", "email-id", "txt_email", "txtemail", "txt_email_id", "email_id_e_mail_a_i_di", "registered_email", "enter_your_email_id", "enter_email_id", "confirm_your_email_id"],
    aadhaar_number: ["aadhaar", "aadhar", "uid", "aadhaar_no", "aadhar_no", "identity_card_no", "enter_identity", "aadhaar_number_", "aadhar_card", "txt_aadhaar", "txtaadhaar", "txt_aadhar", "aadhaar_card_no", "aadhar_number", "uid_no", "aadhar_sankhya", "aadhaar_sankhya"],
    pan_number: ["pan_no", "pan_number", "pancard", "pan_card"],
    epic_number: ["epic_no", "voter_id", "epic_number"],
    category: ["category", "caste_category", "varg", "txt_category", "ddl_category", "ddlcategory", "social_category", "reservation_category", "caste"],
    gender: ["gender", "sex", "ling", "txt_gender", "ddl_gender", "rbl_gender", "male_female_third_gender", "male_female", "\u092A\u0941\u0930\u0941\u0937", "\u0938\u094D\u0924\u094D\u0930\u0940", "\u0924\u0943\u0924\u0940\u092F"],
    pincode: ["pincode", "pin_code", "postal_code", "zip_code", "pin", "zip", "pincode_pin_code"],
    state: ["state_name", "state_of", "rajya", "state", "home_state", "permanent_state", "state_of_residence"],
    district: ["district_name", "jila", "district", "home_district", "permanent_district"],
    nationality: ["nationality", "rashtriyata", "citizenship", "citizen"],
    marital_status: ["marital_status", "marital", "vivah", "married", "marriage_status", "ddl_marital"],
    religion: ["religion", "dharm", "dharma", "ddl_religion", "txt_religion"],
    domicile_state: ["domicile", "domicile_state", "home_state", "state_of_domicile"],
    qualification_status: ["essential_qualification", "have_qualification", "possess_qualification", "affirmation", "qualified"],
    year_of_passing: ["year_of_passing", "passing_year", "year_pass", "year_graduation"],
    grade: ["grade", "division", "class_obtained", "cgpa", "gpa"],
    highest_education_qualification: ["highest_education", "highest_qualification", "highest_level_of_education", "highest_level_of_educational"],
    degree_name: ["degree_name", "degree", "qualification_name", "course_name", "programme"],
    university_name: ["university_name", "university", "institution_name", "college_name", "college"],
    roll_number: ["roll_number", "roll_no", "rollno", "rollnumber", "roll"],
    board_10th: ["10th_class", "matriculation", "class_10", "sslc_board", "class_x", "tenth_class", "board_10th", "board_10", "10th_education", "matric_board", "matriculation_board"],
    board_12th: ["12th_class", "intermediate", "class_12", "class_xii", "twelfth_class", "board_12th", "board_12", "12th_education", "plus_two", "plustwo", "hsc_board", "intermediate_board", "inter_board"],
    board_name: ["education_board", "exam_board", "university_board"],
    passing_year_10th: ["10th_passing_year", "matriculation_year_of_passing", "matric_year", "class_10_year", "tenth_year_of_passing", "sslc_year", "year_of_passing_10th", "passing_year_10th"],
    passing_year_12th: ["12th_passing_year", "intermediate_year_of_passing", "inter_year", "class_12_year", "twelfth_year_of_passing", "hsc_year", "year_of_passing_12th", "passing_year_12th", "plus_two_year"],
    marks_10th: ["10th_marks", "10th_percentage", "matriculation_marks", "matric_percentage", "class_10_marks", "tenth_marks", "sslc_marks", "marks_10th"],
    marks_12th: ["12th_marks", "12th_percentage", "intermediate_marks", "inter_percentage", "class_12_marks", "twelfth_marks", "hsc_marks", "marks_12th", "plus_two_marks"],
    school_name: ["school_name", "school", "last_school_attended", "name_of_school", "institute_name", "last_institution"],
    registration_number: ["registration_number", "reg_number", "reg_no", "registration_no", "enrollment_number", "enrolment_number"],
    village: ["village", "village_name", "gram", "gaon", "txt_village", "ddl_village"],
    post_office: ["post_office", "post", "txt_post", "post_name", "dakghar", "\u0921\u093E\u0915\u0918\u0930"],
    police_station: ["police_station", "thana", "ps", "txt_ps", "ddl_ps", "\u0925\u093E\u0928\u093E"],
    sub_division: ["sub_division", "subdivision", "sub_div", "anumandal", "anchal", "txt_subdiv", "ddl_subdiv", "sub-division", "\u0905\u0928\u0941\u092E\u0902\u0921\u0932"],
    block: ["block", "block_name", "taluka", "tehsil", "prakhnd", "txt_block", "ddl_block", "\u092A\u094D\u0930\u0916\u0902\u0921"],
    panchayat: ["panchayat", "gram_panchayat", "panchayat_name", "\u0917\u094D\u0930\u093E\u092E_\u092A\u0902\u091A\u093E\u092F\u0924", "\u092A\u0902\u091A\u093E\u092F\u0924"],
    ward: ["ward", "ward_no", "ward_number", "ward_no", "\u0935\u093E\u0930\u094D\u0921"],
    purpose: ["purpose", "purpose_of", "uddeshya", "\u0909\u0926\u094D\u0926\u0947\u0936\u094D\u092F"],
    residence_type: ["residence_type", "type_of_residence", "sthayi", "permanent_residence", "\u0938\u094D\u0925\u093E\u092F\u0940", "\u0905\u0938\u094D\u0925\u093E\u092F\u0940"],
    local_body_type: ["local_body_type", "local_body", "gram_panchayat_nagar", "municipal_body"],
    supporting_document_type: ["supporting_document_type", "supporting_document", "document_type", "id_proof"],
    husband_name: ["husband_name", "husband", "pati_ka_naam", "\u092A\u0924\u093F_\u0915\u093E_\u0928\u093E\u092E", "name_of_husband"],
    photo: ["photo", "photograph", "passport_photo", "applicant_photo"],
    house_no: ["house_no", "house_number", "house", "flat_no", "door_no", "txt_house"],
    street: ["street", "street_name", "road", "lane", "txt_street"],
    // Travel / journey (#312) — do not confuse with police_station
    departure: ["departure", "depart", "from", "from_city", "source", "origin", "boarding", "leaving_from", "start_city"],
    arrival: ["arrival", "arrive", "to", "to_city", "destination", "going_to", "end_city"],
    from_station: ["from_station", "source_station", "boarding_station", "origin_station", "from_stn"],
    to_station: ["to_station", "destination_station", "arrival_station", "to_stn"],
    journey_date: ["journey_date", "travel_date", "departure_date", "date_of_journey", "doj", "onward_date", "going_date"],
    return_date: ["return_date", "return_journey_date", "coming_date"],
    travel_class: ["travel_class", "class", "coach_class", "reservation_class"],
    quota: ["quota", "reservation_quota"],
    passenger_count: ["passenger_count", "passengers", "no_of_passengers", "travellers", "adults"]
  };
  function getFieldAliases(serverMappings) {
    const merged = Object.assign({}, FIELD_ALIASES);
    const server = serverMappings || typeof window !== "undefined" && window._ccServerFieldMappings || null;
    if (server && Array.isArray(server)) {
      for (let i = 0; i < server.length; i++) {
        const m = server[i];
        if (!m.semantic_key || !m.match_patterns) continue;
        if (!merged[m.semantic_key]) {
          merged[m.semantic_key] = m.match_patterns.slice();
        } else {
          const existing = new Set(merged[m.semantic_key]);
          for (let j = 0; j < m.match_patterns.length; j++) {
            if (!existing.has(m.match_patterns[j])) merged[m.semantic_key].push(m.match_patterns[j]);
          }
        }
      }
    }
    return merged;
  }
  var CcFieldAliases = {
    getFieldAliases,
    FIELD_ALIASES
  };

  // ../../packages/cc-mapper/src/field-ident.ts
  function isTravelJourneyField(field) {
    const raw = [field == null ? void 0 : field.label, field == null ? void 0 : field.name, field == null ? void 0 : field.id, field == null ? void 0 : field.placeholder, field == null ? void 0 : field.selector].filter(Boolean).join(" ").toLowerCase();
    if (!raw.trim()) return false;
    if (/police[_\s-]?station|\bthana\b|\bps\b/.test(raw)) return false;
    const travelClass = /\b(travel|coach|reservation|journey)[_\s-]?class\b/.test(raw) || /\bclass\b/.test(raw) && /\b(train|flight|berth|quota|coach|sleeper)\b/.test(raw);
    return /\b(from|to|destination|origin|boarding|departure|arrival|journey|train|flight|airport|pnr|berth|quota)\b/.test(raw) || travelClass || /\b(from|to)[_\s-]?station\b/.test(raw) || /\bstation\b/.test(raw) || /\b(depart|arrive|travel)[_\s-]?(date|time|city|from|to)\b/.test(raw);
  }
  var IDENTITY_PROFILE_KEYS = /* @__PURE__ */ new Set([
    "dob",
    "date_of_birth",
    "dob__day",
    "dob__month",
    "dob__year",
    "name",
    "first_name",
    "last_name",
    "middle_name",
    "full_name",
    "father_name",
    "mother_name",
    "husband_name",
    "guardian_name",
    "aadhaar",
    "aadhaar_number",
    "aadhar",
    "pan",
    "pan_number",
    "voter_id",
    "passport",
    "driving_licence",
    "dl_number",
    "gender",
    "sex",
    "email",
    "email_id",
    "phone",
    "mobile",
    "mobile_number"
  ]);
  var ATOM_GROUPS = {
    dob: ["dob", "date_of_birth", "dob__day", "dob__month", "dob__year"],
    mobile: ["mobile", "phone", "mobile_number", "phone_number", "mobile_no"],
    email: ["email", "email_id"],
    gender: ["gender", "sex"],
    name: ["name", "full_name", "first_name", "last_name", "middle_name", "applicant_name"],
    father_name: ["father_name"],
    mother_name: ["mother_name"],
    aadhaar: ["aadhaar", "aadhaar_number", "aadhar"]
  };
  function fieldAtomHint(field) {
    if (!field) return null;
    if (field.humanGate === "otp" || field.humanGate === "captcha") return "otp";
    const lab = String(field.label || "").toLowerCase();
    const idn = `${field.id || ""} ${field.name || ""}`.toLowerCase();
    const typ = String(field.type || "").toLowerCase();
    const ck = String(field.canonicalKey || "").toLowerCase();
    const blob = `${lab} ${idn} ${field.placeholder || ""} ${ck} ${typ}`;
    if (/otp/i.test(blob) && !/slide[-_]?dot/i.test(blob)) return "otp";
    if (/(mobile|phone|sampark|मोबाइल)/i.test(lab) && !/otp/i.test(lab)) return "mobile";
    if (typ === "tel" && !/otp/i.test(blob)) return "mobile";
    if (/e-?mail/i.test(lab)) return "email";
    if (/\bgender\b|\bsex\b/i.test(lab) && !/transgender agency/i.test(lab)) return "gender";
    if (/date of birth|birth date|\bdob\b|date birth/i.test(lab) && !/year of passing|education board/i.test(lab)) return "dob";
    if (/father/i.test(lab) && /name/i.test(lab)) return "father_name";
    if (/mother/i.test(lab) && /name/i.test(lab)) return "mother_name";
    if (/aadhaar|aadhar/i.test(lab) && typ !== "checkbox" && typ !== "checkbox-agreement") return "aadhaar";
    if (ck === "phone" || ck === "mobile_number") return "mobile";
    if (ck === "date_of_birth") return "dob";
    if (ATOM_GROUPS[ck]) return ck;
    return null;
  }
  function profileKeyAgreesWithField(field, profileKey) {
    const pk = String(profileKey || "").toLowerCase().trim();
    if (!pk) return false;
    const hint = fieldAtomHint(field);
    if (!hint) return true;
    if (hint === "otp") return false;
    const group = ATOM_GROUPS[hint];
    if (!group) return true;
    return group.includes(pk);
  }
  function normalizeIdent(s) {
    return String(s || "").toLowerCase().replace(/[-\s:*()'./\\]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  }
  function labelPrimaryIdent(field) {
    const raw = String(field.label || "").trim();
    const en = raw.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim();
    const enCore = en.replace(/[^a-z0-9]/gi, "");
    const labelStrong = enCore.length >= 3 || raw.replace(/\s/g, "").length >= 4;
    let matchBy = "label";
    const parts = [];
    if (en) {
      parts.push(en, en);
    }
    if (raw && raw !== en) {
      parts.push(raw);
    }
    if (field.placeholder && String(field.placeholder).trim().length > 2) {
      parts.push(String(field.placeholder).trim());
    }
    if (field.name) parts.push(String(field.name));
    if (field.id) parts.push(String(field.id));
    let ident = normalizeIdent(parts.join(" "));
    if (!labelStrong) {
      matchBy = "dom-fallback";
      const domBits = [field.placeholder, field.id, field.name].filter(Boolean).join(" ");
      ident = normalizeIdent((ident ? ident + " " : "") + domBits);
    }
    return { ident, matchBy, labelEn: en, labelRaw: raw, labelStrong };
  }
  function normChoice(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function aliasHitsIdent(ident, alias) {
    const a = String(alias || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const id = String(ident || "").toLowerCase();
    if (!a || !id) return false;
    if (id === a) return true;
    const tokens = id.split(/_+/).filter(Boolean);
    const aliasTokens = a.split(/_+/).filter(Boolean);
    if (!aliasTokens.length) return false;
    if (a.length <= 2) return tokens.includes(a);
    for (let i = 0; i <= tokens.length - aliasTokens.length; i++) {
      let ok = true;
      for (let j = 0; j < aliasTokens.length; j++) {
        if (tokens[i + j] !== aliasTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    if (aliasTokens.length === 1 && tokens.includes(a)) return true;
    if (a.length >= 4) {
      const padded = "_" + id + "_";
      if (padded.includes("_" + a + "_")) return true;
    }
    return false;
  }
  function optionText(opt) {
    if (opt == null) return "";
    if (typeof opt === "string") return opt;
    if (typeof opt === "object") {
      const o = opt;
      return String(o.text || o.labelEn || o.label || o.labelHi || o.value || "");
    }
    return String(opt);
  }
  function optionTexts(options) {
    if (!options || options === "dynamic") return [];
    if (!Array.isArray(options)) return [];
    return options.map(optionText).filter(Boolean);
  }
  var CcFieldIdent = {
    normalizeIdent,
    labelPrimaryIdent,
    normChoice,
    aliasHitsIdent,
    optionText,
    optionTexts,
    fieldAtomHint,
    profileKeyAgreesWithField
  };

  // ../../packages/cc-mapper/src/resolve-choice.ts
  function looksLikeYesNo(opts) {
    return opts.length > 0 && opts.every((o) => {
      const n = normChoice(o);
      return !n || n === "yes" || n === "no" || n === "y" || n === "n" || n === "haan" || n === "nahi" || n === "true" || n === "false" || n === "1" || n === "0";
    });
  }
  function resolveChoiceToOption(field, plannedValue, profileKey) {
    if (!field || plannedValue == null || String(plannedValue).trim() === "") return null;
    const planned = String(plannedValue).trim();
    const plannedNorm = normChoice(planned);
    const type = field.type || "";
    const opts = optionTexts(field.options);
    const isYesNo = looksLikeYesNo(opts);
    if (isYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) return null;
    if (isYesNo && /^\d{8,}$/.test(plannedNorm)) return null;
    if (type === "radio-group" && field.options && field.optionSelectors) {
      let matchedIdx = -1;
      for (let oi = 0; oi < opts.length; oi++) {
        if (normChoice(opts[oi]) === plannedNorm) {
          matchedIdx = oi;
          break;
        }
      }
      if (matchedIdx < 0) {
        for (let oi2 = 0; oi2 < opts.length; oi2++) {
          const optN = normChoice(opts[oi2]);
          const shorter = optN.length < plannedNorm.length ? optN : plannedNorm;
          const longer = optN.length < plannedNorm.length ? plannedNorm : optN;
          if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
            matchedIdx = oi2;
            break;
          }
        }
      }
      if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(planned + opts.join(" "))) {
        const wantFemale = /female|f\b|woman|महिला|स्त्री/.test(planned.toLowerCase());
        const wantMale = /male|m\b|man|पुरुष/.test(planned.toLowerCase()) && !wantFemale;
        const wantOther = /other|third|trans|तृतीय/.test(planned.toLowerCase());
        for (let gi = 0; gi < opts.length; gi++) {
          const ol = opts[gi].toLowerCase();
          if (wantFemale && /female|महिला|स्त्री|f\b/.test(ol)) {
            matchedIdx = gi;
            break;
          }
          if (wantMale && /male|पुरुष|m\b/.test(ol) && !/female|third/.test(ol)) {
            matchedIdx = gi;
            break;
          }
          if (wantOther && /other|third|trans|तृतीय/.test(ol)) {
            matchedIdx = gi;
            break;
          }
        }
      }
      if (matchedIdx < 0 && isYesNo) {
        const wantYes = /^(yes|y|true|1|haan|हां)$/i.test(planned);
        const wantNo = /^(no|n|false|0|nahi|नहीं)$/i.test(planned);
        for (let yi = 0; yi < opts.length; yi++) {
          const yn = normChoice(opts[yi]);
          if (wantYes && (yn === "yes" || yn === "y" || yn === "true" || yn === "1" || yn === "haan")) {
            matchedIdx = yi;
            break;
          }
          if (wantNo && (yn === "no" || yn === "n" || yn === "false" || yn === "0" || yn === "nahi")) {
            matchedIdx = yi;
            break;
          }
        }
      }
      if (matchedIdx < 0 || !field.optionSelectors[matchedIdx]) return null;
      const entry = {
        value: opts[matchedIdx],
        type: "radio-click",
        profileKey: profileKey || null,
        label: field.label,
        matchBy: "choice-resolve"
      };
      return {
        selector: field.optionSelectors[matchedIdx],
        entry
      };
    }
    if (type === "radio") {
      return {
        selector: field.selector,
        entry: {
          value: "true",
          type: "radio-click",
          profileKey: profileKey || null,
          label: field.label,
          matchBy: "choice-resolve"
        }
      };
    }
    if (type === "checkbox" || type === "mat-checkbox" || type === "checkbox-agreement") {
      const truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(planned);
      const falsy = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
      if (!truthy && !falsy) return null;
      return {
        selector: field.selector,
        entry: {
          value: truthy ? "yes" : "no",
          type: type === "mat-checkbox" ? "mat-checkbox" : "checkbox",
          profileKey: profileKey || null,
          label: field.label,
          matchBy: "choice-resolve"
        }
      };
    }
    if (type === "checkbox-group" && field.options && field.optionSelectors) {
      if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(planned) && plannedNorm.length > 6) return null;
      const wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(planned);
      if (!wantCheck) return null;
      let cIdx = -1;
      for (let ci = 0; ci < opts.length; ci++) {
        if (normChoice(opts[ci]) === plannedNorm) {
          cIdx = ci;
          break;
        }
      }
      if (cIdx < 0 && field.optionSelectors.length >= 1) cIdx = 0;
      if (cIdx < 0) return null;
      return {
        selector: field.optionSelectors[cIdx],
        entry: {
          value: "yes",
          type: "checkbox",
          profileKey: profileKey || null,
          label: field.label,
          matchBy: "choice-resolve"
        }
      };
    }
    return null;
  }
  var CcResolveChoice = {
    resolveChoiceToOption
  };

  // ../../packages/cc-mapper/src/decide-conditional.ts
  function normalizeIdent2(s) {
    return String(s || "").toLowerCase().replace(/[-\s:*()'./\\]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  }
  function decideConditionalChoice(field, profile) {
    const ident = normalizeIdent2([field.label, field.name, field.id].filter(Boolean).join(" "));
    const label = String(field.label || "").toLowerCase();
    const nameId = ((field.name || "") + " " + (field.id || "")).toLowerCase();
    const blob = ident + " " + label + " " + nameId;
    if (/changed|new_name|name_change|whether.*name/.test(blob)) {
      return profile.changed_name ? "Yes" : "No";
    }
    if (/address.?same|same.?address|isaddresssame|correspondence.?same/.test(blob)) {
      if (profile.same_address != null) return /^(yes|true|1)$/i.test(String(profile.same_address)) ? "Yes" : "No";
      return "Yes";
    }
    if (/disabilit|pwd|divyang|handicapped|is_pwd/.test(blob)) {
      const d = profile.is_pwd || profile.disability || profile.pwd;
      if (d != null) return /^(yes|y|true|1)$/i.test(String(d)) ? "Yes" : "No";
      return "No";
    }
    if (/ex.?serviceman|ex.?service/.test(blob)) {
      const e = profile.ex_serviceman;
      if (e != null) return /^(yes|y|true|1)$/i.test(String(e)) ? "Yes" : "No";
      return "No";
    }
    if (/aadhar.?declar|aadhaar.?declar|declaration|consent|i_agree|i agree|confirm.*information/.test(blob)) {
      return "Yes";
    }
    if (/gender|sex|ling|पुरुष|महिला|male|female|तृतीय/.test(blob)) {
      return profile.gender || profile.sex || null;
    }
    if (/marital|married|unmarried|विवाह/.test(blob)) {
      return profile.marital_status || profile.marital || null;
    }
    if (/reserv|category.?belong|is_reserved/.test(blob)) {
      const r = profile.is_reserved_category;
      if (r != null) return /^(yes|y|true|1)$/i.test(String(r)) ? "Yes" : "No";
    }
    return null;
  }
  var CcDecideConditional = {
    decideConditionalChoice
  };

  // ../../packages/cc-mapper/src/match-special-fields.ts
  var FILE_ALIASES = {
    photo: ["photo", "photograph", "passport photo", "applicant photo", "image", "profile photo", "customer photograph"],
    signature: ["signature", "sign", "applicant signature", "digital signature"],
    aadhaar_doc: ["aadhaar", "aadhar", "aadhaar document", "aadhaar card", "uid"],
    pan_doc: ["pan", "pan card", "pan document"],
    certificate: ["certificate", "marksheet", "mark sheet", "passing certificate", "degree certificate"],
    resume: ["resume", "cv", "curriculum vitae", "bio data"],
    passport_doc: ["passport", "passport document"],
    license_doc: ["driving license", "licence", "dl"],
    utility_bill: ["utility bill", "electricity bill", "address proof"]
  };
  var EDU_ALIASES = {
    board_10th: ["board_10th", "board_matric", "board_class10", "10th_board", "matric_board", "boardname_hs", "ddl_boardname_hs", "matriculation_10th_class_education_board", "matriculation_class_education_board", "class_10th_education_board", "10th_class_education_board", "matriculation_education_board", "tenth_class_education_board", "class_x_education_board", "sslc_education_board"],
    board_12th: ["board_12th", "board_inter", "board_class12", "12th_board", "inter_board", "intermediate_education_board", "class_12th_education_board", "12th_class_education_board", "twelfth_education_board", "class_xii_education_board", "plus_two_education_board", "hsc_education_board"],
    roll_number_10th: ["roll_number_10th", "roll_no_10th", "roll_10th", "roll_matric", "matric_roll", "10th_roll", "matriculation_roll_number", "matriculation_10th_class_roll_number", "class_10_roll_number", "tenth_roll_number", "sslc_roll_number"],
    roll_number_12th: ["roll_number_12th", "roll_no_12th", "roll_12th", "roll_inter", "inter_roll", "12th_roll", "intermediate_roll_number", "class_12_roll_number", "twelfth_roll_number", "hsc_roll_number", "plus_two_roll_number"],
    passing_year_10th: ["passing_year_10th", "year_10th", "year_matric", "matric_year", "10th_year", "year_of_passing_10", "yearofpassing_hs", "ddl_yearofpassing_hs", "matriculation_year_of_passing", "matriculation_10th_class_year_of_passing", "class_10_year_of_passing", "tenth_year_of_passing"],
    passing_year_12th: ["passing_year_12th", "year_12th", "year_inter", "inter_year", "12th_year", "year_of_passing_12", "intermediate_year_of_passing", "class_12_year_of_passing", "twelfth_year_of_passing"],
    marks_10th: ["marks_10th", "percentage_10th", "10th_marks", "matric_marks", "10th_percentage"],
    marks_12th: ["marks_12th", "percentage_12th", "12th_marks", "inter_marks", "12th_percentage"],
    school_name: ["school_name", "school", "institution_10", "matric_school"],
    college_name: ["college_name", "college", "institution_12", "inter_college"],
    university_name: ["university_name", "university", "institution_grad", "college_grad", "institution_name"],
    roll_no_graduation: ["roll_no_graduation", "roll_grad", "graduation_roll", "degree_roll"],
    year_of_passing: ["year_of_passing", "passing_year", "year_pass", "year_graduation", "grad_year"],
    grade: ["grade", "grade_system", "grading", "cgpa", "gpa", "division", "class_obtained"],
    degree_name: ["degree_name", "degree", "qualification", "course_name", "programme"],
    marks_graduation: ["marks_graduation", "percentage_grad", "grad_marks", "grad_percentage"]
  };
  function isTwinField(field, ident) {
    const rawLbl = (field.label || "").trim();
    return /^(?:[a-z]\.|\d+\.|\(\w\)|[ixv]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b/i.test(rawLbl) || /retype|re_type|reenter|re_enter|^confirm/i.test(ident) || !!(field.id && /^(conf|c_|re_|retype|verify|confirm)/i.test(field.id)) || !!(field.name && /^(re_|retype|verify|confirm)/i.test(field.name));
  }
  function tryMatchAgreement(field, ident, matchBy, mapping) {
    if (field.type !== "checkbox" && field.type !== "mat-checkbox") return false;
    const labelText = (field.label || "").toLowerCase();
    const isAgreement = /\bi\s+(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|consent|terms\s+and\s+conditions|self[\s_-]?declaration|^agree$|^accept$|^confirm$/i.test(labelText) || /i_(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|^agree$|^accept$|^confirm$|consent|self_declaration/i.test(ident);
    const fieldNameId = (field.name || "") + " " + (field.id || "");
    const isAgreeByName = /\b(agree|accept|consent|confirm|declar|tnc|terms)\b/i.test(fieldNameId);
    if (isAgreement || isAgreeByName) {
      mapping[field.selector] = { value: "yes", type: field.type, matchBy, profileKey: null };
    }
    return true;
  }
  function tryMatchFile(field, ident, matchBy, profile, mapping) {
    if (field.type !== "file") return false;
    const fileLabelLower = (field.label || "").toLowerCase();
    const fileIdentLower = ident.toLowerCase();
    for (const fk in FILE_ALIASES) {
      if (!profile[fk]) continue;
      const fileHit = FILE_ALIASES[fk].some((a) => {
        return fileLabelLower.includes(a) || matchBy !== "label" && fileIdentLower.includes(a.replace(/\s+/g, "_"));
      });
      if (fileHit) {
        mapping[field.selector] = { value: profile[fk], type: "file", matchBy, profileKey: fk };
        break;
      }
    }
    return true;
  }
  function isEducationRow(ident) {
    const _hasName = ident.includes("name");
    const _isRelativeName = ident.includes("father") || ident.includes("mother") || ident.includes("husband") || ident.includes("spouse") || ident.includes("guardian");
    const isCandidateNameField = _hasName && !_isRelativeName && (ident.includes("candidate") || ident.includes("applicant") || ident.includes("student") || ident.includes("full_name") || ident.includes("your_name") || /^name/.test(ident) || ident.includes("_name_as_per"));
    const isHighestEduField = ident.includes("highest");
    if (ident.includes("date_of_birth") || ident.includes("dateofbirth") || ident.includes("birth_date") || /(^|_)dob(_|$)/.test(ident)) return false;
    if (_isRelativeName) return false;
    return !isCandidateNameField && !isHighestEduField && (ident.includes("matric") || ident.includes("10th") || ident.includes("12th") || ident.includes("graduation") || ident.includes("diploma") || ident.includes("board") || ident.includes("university") || ident.includes("certificate") || ident.includes("year_of") || ident.includes("percentage") || ident.includes("subject") || ident.includes("inter_roll"));
  }
  function tryMatchEducation(field, ident, matchBy, profile, mapping) {
    if (!isEducationRow(ident)) return false;
    for (const ek in EDU_ALIASES) {
      if (!profile[ek]) continue;
      if (EDU_ALIASES[ek].some((a) => ident.includes(a))) {
        mapping[field.selector] = { value: profile[ek], type: field.type || "", matchBy, profileKey: ek };
        break;
      }
    }
    return true;
  }
  function tryMatch(field, ident, matchBy, profile, helpers, mapping) {
    if (isTwinField(field, ident)) {
      const dateTwin = /date of birth|\bdob\b|dd[\s_\-\/.]*mm/i.test(
        `${field.label || ""} ${field.placeholder || ""} ${field.id || ""} ${field.name || ""}`
      );
      if (!dateTwin && field.canonicalKey !== "dob") return true;
    }
    if (field.type === "radio" || field.type === "radio-group") {
      const condDecision = helpers.decideConditionalChoice(field, profile);
      if (condDecision) {
        const blob = `${field.label || ""} ${field.name || ""} ${field.id || ""} ${field.canonicalKey || ""}`.toLowerCase();
        let condKey = field.canonicalKey || null;
        if (!condKey) {
          if (/gender|sex|ling|पुरुष|महिला|स्त्री|तृतीय/.test(blob)) condKey = "gender";
          else if (/marital/.test(blob)) condKey = "marital_status";
          else if (/disabilit|pwd|divyang/.test(blob)) condKey = "is_pwd";
          else if (/ex.?serviceman/.test(blob)) condKey = "ex_serviceman";
          else if (/changed|new_name|name_change/.test(blob)) condKey = "changed_name";
        }
        const resolvedCond = helpers.resolveChoiceToOption(field, condDecision, condKey);
        if (resolvedCond) {
          mapping[resolvedCond.selector] = resolvedCond.entry;
          return true;
        }
      }
    }
    if (tryMatchAgreement(field, ident, matchBy, mapping)) return true;
    if (tryMatchFile(field, ident, matchBy, profile, mapping)) return true;
    if (tryMatchEducation(field, ident, matchBy, profile, mapping)) return true;
    return false;
  }
  var CcMatchSpecialFields = {
    tryMatch,
    isTwinField,
    isEducationRow
  };

  // ../../packages/cc-mapper/src/split-dob.ts
  function parseDobParts(dob) {
    if (dob == null) return null;
    const dobStr = String(dob).trim();
    if (!dobStr) return null;
    const m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    const m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m1) return { day: m1[1].padStart(2, "0"), month: m1[2].padStart(2, "0"), year: m1[3] };
    if (m2) return { day: m2[3].padStart(2, "0"), month: m2[2].padStart(2, "0"), year: m2[1] };
    return null;
  }
  var GENERATED_DD_ID_RE = /\b(?:ng-dd-|mat-select-|mat-input-|combobox-)\d+\b/gi;
  var FULL_DATE_RE = /\bdd[\s_\-\/.]*mm[\s_\-\/.]*(?:yyyy|yyy)\b/i;
  var NOT_DOB_RE = /\b(gender|sex|education board|matriculation|qualification|year of passing|highest level|nationality|country of nationality)\b/i;
  var DOB_HINT_RE = /\b(date of birth|dob|birth date|birth_date|datebirth|day of birth|month of birth|year of birth)\b/i;
  function stripGeneratedWidgetIds(s) {
    return String(s || "").replace(GENERATED_DD_ID_RE, " ");
  }
  function locatorPlaceholder(field) {
    const locs = field == null ? void 0 : field.locators;
    if (!Array.isArray(locs)) return "";
    for (let i = 0; i < locs.length; i++) {
      if (locs[i] && locs[i].type === "placeholder" && locs[i].value) return String(locs[i].value);
    }
    return "";
  }
  function isFullDateWidget(field) {
    if (!field) return false;
    const lab = String(field.label || "").trim();
    const ck = String(field.canonicalKey || "");
    if ((ck === "dob" || ck === "date_of_birth") && !/^dd$|^day$|^mm$|^month$|^yyyy$|^yyy$|^year$/i.test(lab)) {
      if (!profileKeyAgreesWithField(field, "dob")) return false;
      return true;
    }
    const ph = `${field.placeholder || ""} ${locatorPlaceholder(field)}`;
    const blob = `${lab} ${ph}`;
    if (FULL_DATE_RE.test(blob)) return true;
    if (/date of birth|\bbirth date\b/i.test(lab) && !/^dd$|^day$/i.test(lab)) return true;
    if (/dateBirth|effectiveDate|jquerryEffectiveDate/i.test(`${field.id || ""} ${field.name || ""}`)) return true;
    return false;
  }
  function refusesDobSplit(field) {
    if (!field) return true;
    const ck = String(field.canonicalKey || "");
    if (ck && ck !== "dob" && ck !== "date_of_birth") return true;
    const blob = stripGeneratedWidgetIds(
      [field.label, field.name, field.id, field.placeholder, field.selector].filter(Boolean).join(" ")
    );
    if (NOT_DOB_RE.test(blob) && !DOB_HINT_RE.test(blob) && !FULL_DATE_RE.test(blob)) return true;
    return false;
  }
  function applySplitDob(formFields, profile, mapping) {
    if (!profile || profile.dob == null || profile.dob === "") return;
    const dp = parseDobParts(profile.dob);
    if (!dp) return;
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthShort = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthNum = parseInt(dp.month, 10) || 0;
    for (let di = 0; di < formFields.length; di++) {
      const df = formFields[di];
      if (!df || !df.selector || mapping[df.selector]) continue;
      if (refusesDobSplit(df) || isFullDateWidget(df)) continue;
      const lbl = String(df.label || "").trim();
      const idn = stripGeneratedWidgetIds(`${df.id || ""} ${df.name || ""}`).toLowerCase();
      const ph = String(df.placeholder || "").trim();
      const combined = stripGeneratedWidgetIds(`${lbl} ${ph} ${idn}`).toLowerCase();
      const isDay = /^dd$|^day$|^(\(?day\)?)$|day_of_birth|dob_day|birth_day|birthday_dd/i.test(lbl) || /^dd$|^day$/i.test(ph) || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth|birthday_?dd|ddl_?day)(?:[^a-z]|$)/i.test(idn) || /\bdd\b/.test(combined) && !FULL_DATE_RE.test(combined) && !/\bdd[\s_\-\/.]*mm/.test(combined) && !DOB_HINT_RE.test(`${lbl} ${ph}`);
      const isMonth = /^mm$|^month$|^(\(?month\)?)$|month_of_birth|dob_month|birth_month/i.test(lbl) || /^mm$|^month$/i.test(ph) || /(?:^|[^a-z])(dob_?month|birth_?month|month_of_birth|ddl_?month)(?:[^a-z]|$)/i.test(idn) || /\bmm\b/.test(combined) && !/\bdd[\s_-]*mm[\s_-]*yyyy/.test(combined) && !isDay;
      const isYear = /^yyyy$|^yyy$|^year$|^(\(?year\)?)$|year_of_birth|dob_year|birth_year/i.test(lbl) || /^yyyy$|^year$/i.test(ph) || /(?:^|[^a-z])(dob_?year|birth_?year|year_of_birth|ddl_?year)(?:[^a-z]|$)/i.test(idn);
      if (isDay) {
        const preferPadded = /^dd$/i.test(lbl) || /^dd$/i.test(ph) || (df.type || "") === "text";
        mapping[df.selector] = {
          value: preferPadded ? dp.day : String(parseInt(dp.day, 10)),
          type: df.type || "",
          label: df.label || null,
          profileKey: "dob",
          matchBy: "split-dob"
        };
      } else if (isMonth) {
        const t = String(df.type || "").toLowerCase();
        const monthVal = t === "select" || t === "dropdown" || t === "mat-select" || t === "ng-dropdown" ? monthNames[monthNum] || dp.month : dp.month;
        mapping[df.selector] = {
          value: monthVal,
          type: df.type || "",
          label: df.label || null,
          profileKey: "dob",
          matchBy: "split-dob",
          monthNum,
          monthShort: monthShort[monthNum]
        };
      } else if (isYear) {
        mapping[df.selector] = {
          value: dp.year,
          type: df.type || "",
          label: df.label || null,
          profileKey: "dob",
          matchBy: "split-dob"
        };
      }
    }
  }

  // ../../packages/cc-mapper/src/mapping-relation.ts
  var PROFILE_KEY_SYNONYMS = {
    email: ["email", "email_id", "email-id"],
    email_id: ["email_id", "email-id", "email"],
    mobile: ["mobile", "phone", "mobile_number"],
    phone: ["phone", "mobile", "mobile_number"],
    sub_division: ["sub_division", "sub-division"],
    pincode: ["pincode", "pin_code", "pin-code"]
  };
  function profileKeyCandidates(key) {
    const k = String(key || "");
    if (!k) return [];
    const out = [];
    const add = (x) => {
      if (x && out.indexOf(x) < 0) out.push(x);
    };
    add(k);
    add(k.replace(/-/g, "_"));
    add(k.replace(/_/g, "-"));
    const syn = PROFILE_KEY_SYNONYMS[k.replace(/-/g, "_")] || PROFILE_KEY_SYNONYMS[k];
    if (syn) syn.forEach(add);
    return out;
  }
  function profileAtom(profile, key) {
    if (!profile || key == null) return null;
    const keys = profileKeyCandidates(key);
    for (let i = 0; i < keys.length; i++) {
      const entry = profile[keys[i]];
      if (entry == null) continue;
      const v = typeof entry === "object" && entry && "value" in entry ? entry.value : entry;
      if (v == null) continue;
      const s = String(v).trim();
      if (s !== "") return s;
    }
    return null;
  }

  // ../../packages/cc-mapper/src/match-profile-fields.ts
  var LOCKED_CANONICAL = /* @__PURE__ */ new Set([
    "panchayat",
    "police_station",
    "post_office",
    "village",
    "block",
    "district",
    "state",
    "sub_division",
    "ward",
    "gender",
    "name",
    "father_name",
    "mother_name",
    "husband_name",
    "pincode",
    "mobile",
    "email",
    "aadhaar_number",
    "photo",
    "purpose",
    "apply_to_office",
    "local_body_type",
    "residence_type",
    "supporting_document_type",
    "circle",
    "dob",
    "board_10th",
    "board_12th",
    "year_of_passing",
    "highest_education_qualification",
    "roll_number"
  ]);
  function tryMatchNameParts(field, ident, matchBy, nameParts, mapping) {
    const isFatherMother = ident.includes("father") || ident.includes("mother") || ident.includes("pita") || ident.includes("mata");
    if (isFatherMother) return false;
    if (ident.includes("first_name") || ident.includes("firstname") || ident === "fname") {
      if (nameParts.firstName) {
        mapping[field.selector] = { value: nameParts.firstName, type: field.type || "", matchBy, profileKey: "first_name" };
        return true;
      }
    }
    if (ident.includes("last_name") || ident.includes("lastname") || ident === "lname" || ident.includes("surname")) {
      if (nameParts.lastName) {
        mapping[field.selector] = { value: nameParts.lastName, type: field.type || "", matchBy, profileKey: "last_name" };
        return true;
      }
    }
    if (ident.includes("middle_name") || ident.includes("middlename")) {
      mapping[field.selector] = { value: nameParts.middleName, type: field.type || "", matchBy, profileKey: "middle_name" };
      return true;
    }
    return false;
  }
  function tryMatchDob(field, ident, matchBy, profile, mapping) {
    if (!profile.dob) return false;
    if (isTravelJourneyField(field)) return false;
    if (!profileKeyAgreesWithField(field, "dob")) return false;
    if (refusesDobSplit(field)) return false;
    const dp = parseDobParts(profile.dob);
    if (!dp) return false;
    const dobDay = dp.day, dobMonth = dp.month, dobYear = dp.year;
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthShort = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthNum = parseInt(dobMonth, 10) || 0;
    const selLower = matchBy === "dom-fallback" ? (field.selector || "").toLowerCase() : "";
    const t = (field.type || "").toLowerCase();
    const ph = String(field.placeholder || "");
    const lab = String(field.label || "");
    if (isFullDateWidget(field) || /dd[-/.]mm[-/.]yyyy/i.test(ph) || /dd[-/.]mm[-/.]yyyy/i.test(lab)) {
      const pattern = `${ph} ${lab}`;
      const sep = /dd-mm/i.test(pattern) ? "-" : /dd\.mm/i.test(pattern) ? "." : "/";
      mapping[field.selector] = { value: `${dobDay}${sep}${dobMonth}${sep}${dobYear}`, type: field.type || "", matchBy: "label", profileKey: "dob" };
      return true;
    }
    if (ident.includes("day") && (ident.includes("birth") || ident.includes("dob") || ident.includes("born") || ident.replace(/[_\s]/g, "") === "day" || selLower.includes("ddl_day") || selLower.includes("_day"))) {
      mapping[field.selector] = { value: parseInt(dobDay, 10).toString(), type: field.type || "", matchBy, profileKey: "dob" };
      return true;
    }
    if (ident.includes("month") && (ident.includes("birth") || ident.includes("dob") || ident.includes("born") || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes("ddl_month") || selLower.includes("_month"))) {
      const monthVal = t === "select" || t === "dropdown" || t === "mat-select" ? monthNames[monthNum] : dobMonth;
      mapping[field.selector] = { value: monthVal, type: field.type || "", monthNum, monthShort: monthShort[monthNum], matchBy, profileKey: "dob" };
      return true;
    }
    if (ident.includes("year") && (ident.includes("birth") || ident.includes("dob") || ident.includes("born") || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes("ddl_year") || selLower.includes("_year"))) {
      mapping[field.selector] = { value: dobYear, type: field.type || "", matchBy, profileKey: "dob" };
      return true;
    }
    if (field.placeholder === "dd-mm-yyyy" || field.placeholder === "DD-MM-YYYY" || /^dd[-/]mm[-/]yyyy$/i.test(field.label || "")) {
      mapping[field.selector] = { value: `${dobDay}-${dobMonth}-${dobYear}`, type: field.type || "", matchBy: "label", profileKey: "dob" };
      return true;
    }
    if (ident.includes("dob") || ident.includes("date_of_birth") || ident.includes("dateofbirth") || ident.includes("birth_date") || ident.includes("date") && ident.includes("birth")) {
      const sep = (field.placeholder || "").includes("-") ? "-" : "/";
      mapping[field.selector] = { value: dobDay + sep + dobMonth + sep + dobYear, type: field.type || "", matchBy, profileKey: "dob" };
      return true;
    }
    return false;
  }
  function identLooksLikePoliceStation(ident) {
    return ident.includes("police_station") || ident.includes("thana") || /(?:^|_)ps(?:_|$)/.test(ident);
  }
  function tryMatchAlias(field, ident, matchBy, profile, helpers, mapping) {
    const fieldAliases = helpers.fieldAliases || {};
    const normalizeIdent3 = helpers.normalizeIdent || ((s) => String(s || "").toLowerCase().replace(/\W+/g, "_"));
    const resolveChoiceToOption2 = helpers.resolveChoiceToOption || (() => null);
    const isFatherMother = ident.includes("father") || ident.includes("mother") || ident.includes("pita") || ident.includes("mata");
    const isStateDistrict = ident.includes("state") || ident.includes("district") || ident.includes("rajya") || ident.includes("jila");
    const canonical = String(field.canonicalKey || "");
    let bestKey = null;
    let bestAliasLen = -1;
    for (const profileKey in fieldAliases) {
      const atom = profileAtom(profile, profileKey) || (field.constantValue && profileKey === canonical ? field.constantValue : null);
      if (!atom) continue;
      if (profileKey === "name" && (isFatherMother || isStateDistrict)) continue;
      if (profileKey === "name" && (ident.includes("first_name") || ident.includes("firstname") || ident.includes("last_name") || ident.includes("lastname") || ident.includes("surname") || ident.includes("middle_name") || ident.includes("middlename"))) continue;
      if (profileKey === "father_name" && !isFatherMother && canonical !== "father_name") continue;
      if (profileKey === "mother_name" && !(ident.includes("mother") || ident.includes("mata")) && canonical !== "mother_name") continue;
      if (profileKey === "name" && (ident.includes("husband") || ident.includes("wife") || ident.includes("spouse") || ident.includes("guardian") || ident.includes("pati") || ident.includes("pita_pati"))) continue;
      if ((profileKey === "post_office" || profileKey === "village") && (ident.includes("purpose") || ident.includes("uddeshya") || ident.includes("apply") && ident.includes("office"))) continue;
      if (profileKey === "village" && (ident.includes("panchayat") || canonical === "panchayat")) continue;
      if (canonical && LOCKED_CANONICAL.has(canonical) && profileKey !== canonical && profileKeyAgreesWithField(field, canonical)) continue;
      if (!profileKeyAgreesWithField(field, profileKey)) continue;
      if (profileKey === "sub_division" && (ident === "circle" || canonical === "circle")) continue;
      if (profileKey === "post_office" && identLooksLikePoliceStation(ident)) continue;
      if (profileKey === "degree_name" && ident.includes("highest")) continue;
      if (field.type === "radio" || field.type === "radio-group") {
        const groupIdent = normalizeIdent3([field.label, field.name, field.id, field.canonicalKey].filter(Boolean).join(" "));
        let groupMatches = canonical === profileKey || fieldAliases[profileKey].some((a) => aliasHitsIdent(groupIdent, a));
        if (!groupMatches && profileKey === "gender" && field.options) {
          const optBlob = optionTexts(field.options).join(" ").toLowerCase();
          groupMatches = /gender|sex|ling|male|female|पुरुष|महिला|स्त्री|तृतीय/.test(groupIdent + " " + optBlob);
        }
        if (!groupMatches) continue;
        const resolved = resolveChoiceToOption2(field, atom, profileKey);
        if (resolved) {
          resolved.entry.matchBy = matchBy;
          mapping[resolved.selector] = resolved.entry;
        }
        continue;
      }
      if (field.type === "checkbox-group") continue;
      if (canonical === profileKey && canonical.length > bestAliasLen) {
        bestAliasLen = canonical.length;
        bestKey = profileKey;
        continue;
      }
      const aliases = fieldAliases[profileKey];
      for (let ai = 0; ai < aliases.length; ai++) {
        const alias = aliases[ai];
        if (!alias || alias.length < 2) continue;
        if (aliasHitsIdent(ident, alias) && alias.length > bestAliasLen) {
          bestAliasLen = alias.length;
          bestKey = profileKey;
        }
      }
    }
    if (bestKey) {
      const bestAtom = profileAtom(profile, bestKey) || field.constantValue || "";
      if (field.type === "radio" || field.type === "radio-group" || field.type === "checkbox-group") {
        const bestResolved = resolveChoiceToOption2(field, bestAtom, bestKey);
        if (bestResolved) {
          bestResolved.entry.matchBy = matchBy;
          mapping[bestResolved.selector] = bestResolved.entry;
        }
      } else {
        mapping[field.selector] = { value: bestAtom, type: field.type || "", matchBy, profileKey: bestKey, label: field.label || null };
      }
    }
  }
  function tryMatch2(field, ident, matchBy, profile, nameParts, helpers, mapping) {
    if (isTravelJourneyField(field)) return true;
    if (field.fillMode === "auto" || field.fillMode === "skip") return true;
    if (field.humanGate === "captcha" || field.humanGate === "otp" || field.humanGate === "submit" || field.humanGate === "upload") return true;
    if (field.canonicalKey === "purpose" || field.canonicalKey === "apply_to_office" || field.canonicalKey === "circle") return true;
    if (ident.includes("hindi") || ident.includes("_hindi") || (field.label || "").includes("\u0939\u093F\u0902\u0926\u0940") || (field.label || "").includes("(Hindi)")) return true;
    const isChangedName = ident.includes("new_name") || ident.includes("changed_name") || ident.includes("newname") || ident.includes("changedname") || (field.label || "").toLowerCase().includes("new name") || (field.label || "").toLowerCase().includes("changed name");
    if (isChangedName && !profile.changed_name) return true;
    if (tryMatchNameParts(field, ident, matchBy, nameParts, mapping)) return true;
    if (tryMatchDob(field, ident, matchBy, profile, mapping)) return true;
    tryMatchAlias(field, ident, matchBy, profile, helpers, mapping);
    return true;
  }
  var CcMatchProfileFields = {
    tryMatch: tryMatch2,
    tryMatchNameParts,
    tryMatchDob
  };

  // ../../packages/cc-mapper/src/fuzzy-post-passes.ts
  var TWIN_PREFIX_RE = /^(?:[a-z]\.|\d+\.|\(\w\)|[i-x]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b[\s:_-]*/i;
  function choiceAlreadyMapped(mapping, f) {
    if (mapping[f.selector]) return true;
    if (f.optionSelectors) {
      for (let si = 0; si < f.optionSelectors.length; si++) {
        if (mapping[f.optionSelectors[si]]) return true;
      }
    }
    return false;
  }
  function applyConditionalPost(formFields, profile, helpers, mapping) {
    const decideConditionalChoice2 = helpers.decideConditionalChoice || (() => null);
    const resolveChoiceToOption2 = helpers.resolveChoiceToOption || (() => null);
    for (let pi = 0; pi < formFields.length; pi++) {
      const pf = formFields[pi];
      if (!(pf.type === "radio" || pf.type === "radio-group" || pf.type === "checkbox-group" || pf.type === "checkbox" || pf.type === "mat-checkbox" || pf.type === "checkbox-agreement")) continue;
      if (choiceAlreadyMapped(mapping, pf)) continue;
      const decision = decideConditionalChoice2(pf, profile);
      if (!decision) continue;
      const resolvedPost = resolveChoiceToOption2(pf, decision, null);
      if (resolvedPost) {
        resolvedPost.entry.matchBy = "conditional-post";
        mapping[resolvedPost.selector] = resolvedPost.entry;
      }
    }
  }
  function normLabel(s) {
    return (s || "").toLowerCase().replace(/^\s*(?:\d+\.|[a-z]\.|\([a-z0-9]+\)|[ixv]+\.)\s*/i, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function applyTwinMirror(formFields, mapping) {
    for (let ti = 0; ti < formFields.length; ti++) {
      const tf = formFields[ti];
      if (mapping[tf.selector]) continue;
      const rawLabel = (tf.label || "").trim();
      if (!rawLabel || !TWIN_PREFIX_RE.test(rawLabel)) continue;
      const primaryLabel = rawLabel.replace(TWIN_PREFIX_RE, "").trim();
      const primaryNorm = normLabel(primaryLabel);
      if (!primaryNorm) continue;
      let primaryField = formFields.find((f) => {
        return mapping[f.selector] && f.selector !== tf.selector && normLabel(f.label || "") === primaryNorm;
      });
      if (!primaryField) {
        primaryField = formFields.find((f) => {
          if (!mapping[f.selector] || f.selector === tf.selector) return false;
          const fNorm = normLabel(f.label || "");
          return !!(fNorm && primaryNorm && (fNorm.includes(primaryNorm) || primaryNorm.includes(fNorm)));
        });
      }
      if (primaryField) {
        mapping[tf.selector] = { value: mapping[primaryField.selector].value, type: tf.type || "" };
      }
    }
  }
  function applyAll(formFields, profile, helpers, mapping) {
    applyConditionalPost(formFields, profile, helpers, mapping);
    applyTwinMirror(formFields, mapping);
    applySplitDob(formFields, profile, mapping);
  }
  var CcFuzzyPostPasses = {
    applyAll,
    applyConditionalPost,
    applyTwinMirror,
    applySplitDob
  };

  // ../../packages/cc-mapper/src/fuzzy-match.ts
  function fuzzyMatch(formFields, profile) {
    const fieldAliases = getFieldAliases();
    const helpers = {
      fieldAliases,
      normalizeIdent,
      resolveChoiceToOption,
      decideConditionalChoice
    };
    const mapping = {};
    let firstName = String(profile.first_name || "");
    let middleName = String(profile.middle_name || "");
    let lastName = String(profile.last_name || "");
    if (!firstName && profile.name) {
      const nameParts = String(profile.name || "").trim().split(/\s+/);
      firstName = nameParts[0] || "";
      lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : "";
      middleName = nameParts.length >= 3 ? nameParts.slice(1, -1).join(" ") : "";
    }
    const names = { firstName, middleName, lastName };
    for (let fi = 0; fi < formFields.length; fi++) {
      const field = formFields[fi];
      const { ident, matchBy } = labelPrimaryIdent(field);
      if (tryMatch(field, ident, matchBy, profile, helpers, mapping)) continue;
      tryMatch2(field, ident, matchBy, profile, names, helpers, mapping);
    }
    applyAll(formFields, profile, helpers, mapping);
    return mapping;
  }
  var CcFuzzyMatch = { fuzzyMatch };

  // ../../packages/cc-mapper/src/ai-match.ts
  async function aiMatch(formFields, profile, llmKey, llmBaseUrl, llmModel) {
    const fieldDescriptions = formFields.map(
      (f, i) => i + ': label="' + (f.label || "") + '" id="' + (f.id || "") + '" name="' + (f.name || "") + '" placeholder="' + (f.placeholder || "") + '"'
    ).join("\n");
    const profileKeys = Object.entries(profile).filter((kv) => kv[1] && kv[0] !== "phone" && kv[0] !== "updatedAt").map((kv) => kv[0] + ': "' + kv[1] + '"').join("\n");
    const prompt = 'You are a form field mapper. Given form fields and a student profile, return a JSON object mapping field index to profile key.\n\nRULES:\n- Return ONLY a valid JSON object, nothing else\n- Map each field to the profile key whose VALUE should fill that field\n- "first name" fields \u2192 use "first_name" profile key\n- "last name" / "surname" fields \u2192 use "last_name" profile key\n- "middle name" fields \u2192 use "middle_name" profile key\n- "full name" / "candidate name" fields \u2192 use "name" profile key\n- Separate day/month/year dropdowns \u2192 use "dob__day", "dob__month", "dob__year"\n- Single "date of birth" text field \u2192 use "dob"\n- For address parts: use "village", "post_office", "police_station", "block", "sub_division", "district", "state", "pincode" as available\n- Only use "address" for full address text fields\n- Confirm/retype fields \u2192 same key as primary field\n- Skip: captcha, OTP, verification code, password\n- NEVER map From/To/station/journey/train/flight/airport/PNR/boarding fields to dob, name, aadhaar, phone, or any identity key\n- For travel fields use: departure/from_station (From), arrival/to_station (To), journey_date (travel date), return_date, travel_class, quota\n- Use EXACT profile key names from the list below\n\nForm fields:\n' + fieldDescriptions + "\n\nAvailable profile keys and values:\n" + profileKeys + '\n\nReturn JSON only: {"0": "name", "2": "dob", "5": "departure", "7": "journey_date"}';
    try {
      const ccLLM = typeof window !== "undefined" ? window.ccLLM : void 0;
      if (!ccLLM) return {};
      const result = await ccLLM.call({
        apiKey: llmKey,
        baseUrl: llmBaseUrl,
        model: llmModel,
        systemPrompt: "You are a JSON-only API. Return ONLY valid JSON objects. No explanations, no markdown, no text before or after the JSON.",
        userPrompt: prompt,
        maxTokens: 300
      });
      if (result.error) return {};
      const indexMap = ccLLM.parseJSON(result.text);
      if (!indexMap) return {};
      const mapping = {};
      const nameParts = String(profile.name || "").trim().split(/\s+/);
      const dobParts = String(profile.dob || "").split("/");
      const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      for (const idx in indexMap) {
        const field = formFields[parseInt(idx, 10)];
        const profileKey = indexMap[idx];
        if (!field) continue;
        let value = null;
        if (profileKey === "name__first") value = profile.first_name || nameParts[0] || "";
        else if (profileKey === "name__last") value = profile.last_name || nameParts[nameParts.length - 1] || "";
        else if (profileKey === "name__middle") value = profile.middle_name || (nameParts.length >= 3 ? nameParts.slice(1, -1).join(" ") : "");
        else if (profileKey === "dob__day") value = dobParts[0] || "";
        else if (profileKey === "dob__month") {
          const mn = parseInt(dobParts[1] || "0", 10);
          value = months[mn] || dobParts[1] || "";
        } else if (profileKey === "dob__year") value = dobParts[2] || "";
        else if (profile[profileKey] != null) value = profile[profileKey];
        if (value === null || value === void 0) continue;
        const fieldIdent = [field.label, field.id, field.name, field.placeholder].filter(Boolean).join(" ").toLowerCase().replace(/[-\s:*()'./]/g, "_");
        const isRelativeField = /husband|wife|spouse|guardian|pati(?!_pati_ka_naam)/i.test(fieldIdent);
        const isFatherField = /father|pita/i.test(fieldIdent);
        const isMotherField = /mother|mata/i.test(fieldIdent);
        if (profileKey === "name" && (isRelativeField || isFatherField || isMotherField)) continue;
        if ((profileKey === "name" || profileKey === "first_name" || profileKey === "last_name" || profileKey === "middle_name") && isRelativeField) continue;
        if (profileKey === "father_name" && !isFatherField) continue;
        if (profileKey === "mother_name" && !isMotherField) continue;
        if (isTravelJourneyField(field) && IDENTITY_PROFILE_KEYS.has(String(profileKey))) continue;
        mapping[field.selector] = { value, type: field.type || "" };
      }
      return mapping;
    } catch (e) {
      return {};
    }
  }
  var CcAiMatch = { aiMatch };

  // ../../packages/cc-mapper/src/inject.ts
  var root = globalThis;
  root.CcFieldAliases = CcFieldAliases;
  root.CcFieldIdent = CcFieldIdent;
  root.CcResolveChoice = CcResolveChoice;
  root.CcDecideConditional = CcDecideConditional;
  root.CcMatchSpecialFields = CcMatchSpecialFields;
  root.CcMatchProfileFields = CcMatchProfileFields;
  root.CcFuzzyPostPasses = CcFuzzyPostPasses;
  root.CcFuzzyMatch = CcFuzzyMatch;
  root.CcAiMatch = CcAiMatch;
  root.fuzzyMatch = fuzzyMatch;
  root.aiMatch = aiMatch;
  root.resolveChoiceToOption = resolveChoiceToOption;
  root.decideConditionalChoice = decideConditionalChoice;
  if (typeof window !== "undefined") {
    window.ccResolveChoiceToOption = resolveChoiceToOption;
    window.ccDecideConditionalChoice = decideConditionalChoice;
  }
})();
