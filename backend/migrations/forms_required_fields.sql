-- Add required_fields (profile keys each form needs) for readiness checks
ALTER TABLE forms ADD COLUMN IF NOT EXISTS required_fields TEXT[] DEFAULT '{}';

-- Common identity fields most forms need
UPDATE forms SET required_fields = ARRAY['name','father_name','dob','gender','aadhaar_number','address','state','pincode']
WHERE short_name IN ('SSC CHSL','SSC CGL','SSC MTS');

UPDATE forms SET required_fields = ARRAY['name','father_name','dob','gender','aadhaar_number','address','state','pincode','board_10th','passing_year_10th']
WHERE short_name IN ('RRB Group D','RRB NTPC');

UPDATE forms SET required_fields = ARRAY['name','father_name','mother_name','dob','gender','aadhaar_number','address','state','pincode','graduation_degree']
WHERE short_name = 'UPSC CSE';

UPDATE forms SET required_fields = ARRAY['name','father_name','mother_name','dob','gender','aadhaar_number','address','state','pincode','board_10th','passing_year_10th','board_12th','passing_year_12th']
WHERE short_name IN ('JEE Main','NEET');

UPDATE forms SET required_fields = ARRAY['name','father_name','mother_name','dob','gender','aadhaar_number','address','state','pincode']
WHERE short_name = 'Passport';

UPDATE forms SET required_fields = ARRAY['name','father_name','dob','gender','aadhaar_number','address','state','pincode','graduation_degree']
WHERE short_name IN ('IBPS PO','IBPS Clerk');

UPDATE forms SET required_fields = ARRAY['name','father_name','dob','gender','aadhaar_number','address']
WHERE short_name IN ('BSEB 10th','PAN Card','Army Agniveer','Voter ID');
