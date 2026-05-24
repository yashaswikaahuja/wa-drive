// Label-to-profileKey heuristic mapping. Server-side mirror of the extension's
// mapper.js FIELD_ALIASES, simplified for backfill use.
//
// Returns the best profileKey for a normalized label, or null if no confident match.

const FIELD_ALIASES = {
  name: ['candidate name', 'candidates name', 'applicant name', 'applicants name', 'student name', 'full name', 'fullname', 'naam', 'name', 'enter name', 'your name'],
  dob: ['dob', 'date of birth', 'dateofbirth', 'birth date', 'janm tithi', 'janm', 'birthdate'],
  father_name: ['father name', 'fathers name', 'father s name', 'pita ka naam', 'pita naam', 'father', 'father husband name'],
  mother_name: ['mother name', 'mothers name', 'mother s name', 'mata ka naam', 'mata naam', 'mother'],
  address: ['address', 'permanent address', 'correspondence address', 'residential address', 'pata', 'niwas', 'full address'],
  phone: ['mobile no', 'mobile number', 'phone no', 'phone number', 'contact no', 'mobile', 'phone', 'sampark', 'enter mobile', 'enter your mobile', 'mobile no mobile sankhya'],
  mobile: ['mobile no', 'mobile number', 'phone no', 'phone number', 'mobile', 'mob no', 'sampark'],
  email: ['email address', 'email id', 'emailid', 'email', 'enter email', 'enter your email', 'mail id', 'e mail'],
  email_id: ['email address', 'email id', 'emailid', 'email', 'enter email id', 'confirm email id', 'mail id'],
  aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar no', 'aadhar no', 'aadhaar number', 'aadhar number', 'identity card no', 'aadhaar card no'],
  vid: ['vid', 'virtual id', 'aadhaar vid'],
  pan_number: ['pan no', 'pan number', 'pancard', 'pan card'],
  epic_number: ['epic no', 'voter id', 'epic number'],
  category: ['category', 'caste category', 'varg', 'social category', 'reservation category', 'caste'],
  gender: ['gender', 'sex', 'ling', 'select gender'],
  pincode: ['pincode', 'pin code', 'postal code', 'zip code', 'pin', 'zip'],
  state: ['state name', 'state of', 'rajya', 'state', 'home state', 'permanent state', 'state ut'],
  district: ['district name', 'jila', 'district', 'home district'],
  nationality: ['nationality', 'rashtriyata', 'citizenship', 'citizen', 'select your country of nationality'],
  marital_status: ['marital status', 'marital', 'vivah', 'married', 'marriage status'],
  religion: ['religion', 'dharm', 'dharma'],
  domicile_state: ['domicile', 'domicile state', 'state of domicile'],
  village: ['village', 'village name', 'gram', 'gaon'],
  post_office: ['post office', 'post', 'po'],
  police_station: ['police station', 'thana', 'ps'],
  sub_division: ['sub division', 'subdivision', 'sub div', 'anumandal', 'anchal', 'circle'],
  block: ['block', 'block name', 'taluka', 'tehsil', 'prakhnd'],
  house_no: ['house no', 'house number', 'house', 'flat no', 'door no'],
  street: ['street', 'street name', 'road', 'lane'],
  // Education
  board_10th: ['matriculation', '10th class', '10th class education board', 'matric board', 'class 10 board', 'tenth class', 'sslc board', '10th board', 'matriculation board', 'matriculation education board', 'matriculation 10th class education board'],
  board_12th: ['intermediate', '12th class', '12th class education board', 'inter board', 'class 12 board', 'twelfth class', 'hsc board', '12th board', 'intermediate board', 'intermediate education board', 'plus two board', 'higher secondary'],
  board_name: ['education board', 'board name', 'exam board', 'university board'],
  roll_number: ['roll number', 'roll no', 'rollno', 'roll'],
  roll_number_10th: ['10th roll number', 'matriculation roll number', 'matric roll', 'class 10 roll', 'tenth roll', 'sslc roll', 'roll number 10th'],
  roll_number_12th: ['12th roll number', 'intermediate roll number', 'inter roll', 'class 12 roll', 'twelfth roll', 'hsc roll', 'roll number 12th'],
  passing_year_10th: ['10th passing year', 'matriculation year of passing', 'matric year', 'class 10 year', 'tenth year of passing', 'year of passing 10th', 'matriculation 10th class year of passing'],
  passing_year_12th: ['12th passing year', 'intermediate year of passing', 'inter year', 'class 12 year', 'twelfth year of passing', 'year of passing 12th', 'plus two year'],
  year_of_passing: ['year of passing', 'passing year', 'year pass'],
  marks_10th: ['10th marks', '10th percentage', 'matriculation marks', 'matric percentage', 'class 10 marks', 'tenth marks'],
  marks_12th: ['12th marks', '12th percentage', 'intermediate marks', 'inter percentage', 'class 12 marks', 'twelfth marks'],
  grade: ['grade', 'division', 'class obtained', 'cgpa', 'gpa'],
  highest_education_qualification: ['highest education', 'highest qualification', 'highest level of education', 'highest level of educational'],
  degree_name: ['degree name', 'degree', 'qualification name', 'course name', 'programme'],
  university_name: ['university name', 'university', 'institution name', 'college name', 'college'],
  school_name: ['school name', 'school', 'last school attended', 'name of school'],
  registration_number: ['registration number', 'reg number', 'reg no', 'registration no', 'enrollment number'],
};

// Returns best profileKey for a label, or null
export function guessProfileKey(label) {
  if (!label) return null;
  const norm = label.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return null;

  // Score each profileKey by alias match strength
  let bestKey = null;
  let bestScore = 0;
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      // Exact normalized match: strongest
      if (norm === alias) {
        if (10 > bestScore) { bestScore = 10; bestKey = key; }
        continue;
      }
      // Whole-word containment: medium-high
      const words = norm.split(' ');
      const aliasWords = alias.split(' ');
      let allMatch = true;
      for (const aw of aliasWords) {
        if (!words.includes(aw)) { allMatch = false; break; }
      }
      if (allMatch && aliasWords.length > 0) {
        const score = 5 + aliasWords.length * 0.5;
        if (score > bestScore) { bestScore = score; bestKey = key; }
        continue;
      }
      // Substring (looser, only credit if alias is reasonably long)
      if (alias.length >= 4 && norm.includes(alias)) {
        const score = 2 + alias.length * 0.05;
        if (score > bestScore) { bestScore = score; bestKey = key; }
      }
    }
  }
  // Require minimum confidence
  return bestScore >= 4 ? bestKey : null;
}
