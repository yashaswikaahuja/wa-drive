const profile = {
  name: 'SANDHYA KUMARI', dob: '14/01/2000', father_name: 'SUDHIR PRASAD',
  mother_name: 'LALITA DEVI', gender: 'FEMALE', mobile: '8727854089',
  email: 'sandhyakumarisanya@gmail.com', aadhaar_number: '729027826597',
  state: 'Bihar', district: 'Gaya', pincode: '823311',
  roll_no_10th: '1500099', board_10th: 'BIHAR SCHOOL EXAMINATION BOARD',
  passing_year_10th: '2015', nationality: 'INDIAN', religion: 'hindu'
};

const testCases = {
  'BSF rectt.bsf.gov.in': [
    { label: "Candidate's Name", id: 'candidateName', name: 'candidateName', type: 'text' },
    { label: 'Mobile No.', id: 'mobileNo', name: 'mobileNo', type: 'tel' },
    { label: 'Email Id', id: 'emailId', name: 'emailId', type: 'email' },
    { label: 'Date of Birth', id: 'dob', name: 'dob', type: 'text', placeholder: 'DD/MM/YYYY' },
    { label: 'Father Name', id: 'fatherName', name: 'fatherName', type: 'text' },
    { label: 'Mother Name', id: 'motherName', name: 'motherName', type: 'text' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Male' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Female' },
    { label: 'Aadhaar Number', id: 'aadhaarNo', name: 'aadhaarNo', type: 'text' },
    { label: 'Pincode', id: 'pincode', name: 'pincode', type: 'text' },
    { label: 'State', id: 'state', name: 'state', type: 'select' },
    { label: 'District', id: 'district', name: 'district', type: 'select' },
  ],
  'BPSC onlinebpsc.bihar.gov.in': [
    { label: 'Candidate Name', id: 'txtCandidateName', name: 'txtCandidateName', type: 'text' },
    { label: "Father's Name", id: 'txtFatherName', name: 'txtFatherName', type: 'text' },
    { label: "Mother's Name", id: 'txtMotherName', name: 'txtMotherName', type: 'text' },
    { label: 'Date of Birth', id: 'txtDOB', name: 'txtDOB', type: 'text', placeholder: 'DD/MM/YYYY' },
    { label: 'Mobile Number', id: 'txtMobile', name: 'txtMobile', type: 'tel' },
    { label: 'Email ID', id: 'txtEmail', name: 'txtEmail', type: 'email' },
    { label: 'Gender', id: 'ddlGender', name: 'ddlGender', type: 'select' },
    { label: 'Category', id: 'ddlCategory', name: 'ddlCategory', type: 'select' },
    { label: 'Aadhaar No.', id: 'txtAadhaar', name: 'txtAadhaar', type: 'text' },
    { label: 'State', id: 'ddlState', name: 'ddlState', type: 'select' },
    { label: 'District', id: 'ddlDistrict', name: 'ddlDistrict', type: 'select' },
    { label: 'Pin Code', id: 'txtPinCode', name: 'txtPinCode', type: 'text' },
    { label: 'Class X Roll No.', id: 'txtRollNo10', name: 'txtRollNo10', type: 'text' },
    { label: 'Class X Board', id: 'txtBoard10', name: 'txtBoard10', type: 'text' },
    { label: 'Class X Passing Year', id: 'txtYear10', name: 'txtYear10', type: 'text' },
  ],
  'UPSC upsconline.nic.in': [
    { label: 'Name', id: 'name', name: 'name', type: 'text' },
    { label: 'Verify Name', id: 'verifyName', name: 'verifyName', type: 'text' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Male' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Female' },
    { label: 'Verify Gender', id: 'verifyGender', name: 'verifyGender', type: 'radio', value: 'Female' },
    { label: 'Date of Birth', id: 'dob', name: 'dob', type: 'text', placeholder: 'DD/MM/YYYY' },
    { label: 'Verify Date of Birth', id: 'verifyDob', name: 'verifyDob', type: 'text' },
    { label: "Father's Name", id: 'fatherName', name: 'fatherName', type: 'text' },
    { label: "Father's Name and Verify", id: 'verifyFather', name: 'verifyFather', type: 'text' },
    { label: "Mother's Name", id: 'motherName', name: 'motherName', type: 'text' },
    { label: 'Mobile Number', id: 'mobile', name: 'mobile', type: 'tel' },
    { label: 'Email ID', id: 'email', name: 'email', type: 'email' },
    { label: 'Board Examination Roll No (Class X)', id: 'boardRollNo', name: 'boardRollNo', type: 'text' },
  ],
  'Rajasthan recruitment.rajasthan.gov.in': [
    { label: "Candidate's Name", id: 'candidateName', name: 'candidateName', type: 'text' },
    { label: "Father's Name", id: 'fatherName', name: 'fatherName', type: 'text' },
    { label: 'Date of Birth', id: 'dateOfBirth', name: 'dateOfBirth', type: 'text', placeholder: 'DD/MM/YYYY' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Male' },
    { label: 'Gender', id: 'gender', name: 'gender', type: 'radio', value: 'Female' },
    { label: 'Mobile No.', id: 'mobileNo', name: 'mobileNo', type: 'tel' },
    { label: 'Category', id: 'category', name: 'category', type: 'select' },
    { label: 'Aadhaar Card No.', id: 'aadhaarCardNo', name: 'aadhaarCardNo', type: 'text' },
    { label: 'Nationality', id: 'nationality', name: 'nationality', type: 'text' },
  ],
};

const ALIASES = {
  name: ['candidate_name','candidates_name','applicant_name','full_name','naam','name','txtcandidatename','your_name'],
  dob: ['dob','date_of_birth','dateofbirth','birth_date','txtdob','dateofbirth'],
  father_name: ['father_name','fathername','fathers_name','father','txtfather','txtfathername'],
  mother_name: ['mother_name','mothername','mothers_name','mother','txtmother','txtmothername'],
  mobile: ['mobile_no','mobile_number','phone_no','mobile','txtmobile','mobileno'],
  email: ['email_address','email_id','emailid','email','txtemail','emailid'],
  aadhaar_number: ['aadhaar','aadhar','aadhaar_no','txtaadhaar','aadhaarno','aadhaar_card_no','uid_no'],
  state: ['state_name','state','ddlstate','rajya'],
  district: ['district_name','district','ddldistrict','jila'],
  pincode: ['pincode','pin_code','txtpincode','pin'],
  roll_no_10th: ['roll_no_10th','txtrollno10','boardrollno','board_roll','class_x_roll'],
  board_10th: ['board_10th','txtboard10','board_examination'],
  passing_year_10th: ['passing_year_10th','txtyear10'],
  nationality: ['nationality'],
  religion: ['religion'],
  gender: ['gender','sex','ddlgender'],
  category: ['category','caste_category','ddlcategory','social_category'],
};

for (const [site, fields] of Object.entries(testCases)) {
  console.log('\n=== ' + site + ' ===');
  for (const f of fields) {
    const labelEn = (f.label || '').replace(/[^\x00-\x7F]/g, ' ').trim();
    const ident = [labelEn, f.placeholder||'', f.id||'', f.name||''].filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g, '_');

    // Skip verify fields
    if (/^verify_|_and_verify|^confirm_/.test(ident)) {
      console.log('  ⏭  ' + f.label + ' → SKIPPED (verify mirror)');
      continue;
    }

    const isFatherMother = ident.includes('father') || ident.includes('mother');

    if (f.type === 'radio') {
      let matched = false;
      for (const [key, aliases] of Object.entries(ALIASES)) {
        if (!profile[key]) continue;
        const profileVal = profile[key].toLowerCase().replace(/[^a-z0-9]/g,'');
        const optLabel = (f.value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const groupIdent = [f.name,f.id].join(' ').toLowerCase().replace(/[-_\s]/g,'');
        const groupMatches = aliases.some(a => groupIdent.includes(a.replace(/[^a-z0-9]/g,'')));
        if (groupMatches && optLabel.includes(profileVal)) {
          console.log('  ✓  ' + f.label + ' (' + f.value + ') → CLICK [' + key + '=' + profile[key] + ']');
          matched = true; break;
        }
      }
      if (!matched) console.log('  ❌  ' + f.label + ' (' + (f.value||'') + ') → no match');
      continue;
    }

    // select/text
    let matched = false;
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (!profile[key]) continue;
      if (key === 'name' && isFatherMother) continue;
      if (key === 'father_name' && !isFatherMother) continue;
      if (key === 'mother_name' && !ident.includes('mother')) continue;
      if (aliases.some(a => ident.includes(a))) {
        const val = f.type === 'select' ? '[dropdown: ' + profile[key] + ']' : profile[key];
        console.log('  ✓  ' + f.label + ' → ' + val + ' [' + key + ']');
        matched = true; break;
      }
    }
    if (!matched) console.log('  ❌  ' + f.label + ' → NO MATCH  ident=' + ident.slice(0,50));
  }
}
