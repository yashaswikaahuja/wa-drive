-- Form Directory: shared catalog of Indian govt forms with photo/signature specs
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  portal TEXT NOT NULL,
  url TEXT NOT NULL,
  search_keywords TEXT[] DEFAULT '{}',
  required_documents TEXT[] DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  fee JSONB DEFAULT '{}',
  photo_specs JSONB,
  signature_specs JSONB,
  fill_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forms_keywords ON forms USING GIN (search_keywords);
CREATE INDEX IF NOT EXISTS idx_forms_name ON forms USING GIN (to_tsvector('english', name || ' ' || short_name || ' ' || portal));

-- Seed top Indian government forms
INSERT INTO forms (name, short_name, portal, url, search_keywords, required_documents, fee, photo_specs, signature_specs) VALUES

('SSC Combined Higher Secondary Level', 'SSC CHSL', 'SSC', 'https://ssc.gov.in',
 ARRAY['ssc','chsl','10+2','ldc','deo','clerk'],
 ARRAY['Aadhaar','10th Marksheet','12th Marksheet','Photo','Signature'],
 '{"general":100,"obc":100,"sc_st":0,"female":0}',
 '{"width":100,"height":120,"minKB":4,"maxKB":12,"format":"jpg","bg":"white"}',
 '{"width":140,"height":60,"minKB":1,"maxKB":6,"format":"jpg","bg":"white"}'),

('SSC Combined Graduate Level', 'SSC CGL', 'SSC', 'https://ssc.gov.in',
 ARRAY['ssc','cgl','graduate','inspector','auditor'],
 ARRAY['Aadhaar','Graduation Marksheet','Photo','Signature'],
 '{"general":100,"obc":100,"sc_st":0,"female":0}',
 '{"width":100,"height":120,"minKB":4,"maxKB":12,"format":"jpg","bg":"white"}',
 '{"width":140,"height":60,"minKB":1,"maxKB":6,"format":"jpg","bg":"white"}'),

('SSC Multi Tasking Staff', 'SSC MTS', 'SSC', 'https://ssc.gov.in',
 ARRAY['ssc','mts','multi tasking','peon','havaldar'],
 ARRAY['Aadhaar','10th Marksheet','Photo','Signature'],
 '{"general":100,"obc":100,"sc_st":0,"female":0}',
 '{"width":100,"height":120,"minKB":4,"maxKB":12,"format":"jpg","bg":"white"}',
 '{"width":140,"height":60,"minKB":1,"maxKB":6,"format":"jpg","bg":"white"}'),

('RRB Group D', 'RRB Group D', 'Railway', 'https://www.rrbcdg.gov.in',
 ARRAY['rrb','railway','group d','level 1','track maintainer'],
 ARRAY['Aadhaar','10th Marksheet','Photo','Signature','Caste Certificate'],
 '{"general":500,"obc":500,"sc_st":250,"female":250}',
 '{"width":413,"height":531,"minKB":20,"maxKB":50,"format":"jpg","bg":"white"}',
 '{"width":413,"height":177,"minKB":10,"maxKB":20,"format":"jpg","bg":"white"}'),

('RRB NTPC', 'RRB NTPC', 'Railway', 'https://www.rrbcdg.gov.in',
 ARRAY['rrb','railway','ntpc','non technical','station master','clerk'],
 ARRAY['Aadhaar','12th Marksheet','Graduation Marksheet','Photo','Signature'],
 '{"general":500,"obc":500,"sc_st":250,"female":250}',
 '{"width":413,"height":531,"minKB":20,"maxKB":50,"format":"jpg","bg":"white"}',
 '{"width":413,"height":177,"minKB":10,"maxKB":20,"format":"jpg","bg":"white"}'),

('UPSC Civil Services', 'UPSC CSE', 'UPSC', 'https://upsconline.nic.in',
 ARRAY['upsc','ias','ips','civil services','cse','prelims'],
 ARRAY['Aadhaar','Graduation Degree','Photo','Signature','Category Certificate'],
 '{"general":100,"obc":100,"sc_st":0,"female":0}',
 '{"width":350,"height":350,"minKB":20,"maxKB":300,"format":"jpg","bg":"white"}',
 '{"width":350,"height":175,"minKB":1,"maxKB":40,"format":"jpg","bg":"white"}'),

('NTA JEE Main', 'JEE Main', 'NTA', 'https://jeemain.nta.nic.in',
 ARRAY['jee','jee main','nta','engineering','iit','nit','b.tech'],
 ARRAY['Aadhaar','10th Marksheet','12th Marksheet','Photo','Signature'],
 '{"general":1000,"obc":900,"sc_st":500,"female":800}',
 '{"width":413,"height":531,"minKB":10,"maxKB":200,"format":"jpg","bg":"white"}',
 '{"width":413,"height":177,"minKB":4,"maxKB":30,"format":"jpg","bg":"white"}'),

('NTA NEET UG', 'NEET', 'NTA', 'https://neet.nta.nic.in',
 ARRAY['neet','nta','medical','mbbs','bds','doctor'],
 ARRAY['Aadhaar','10th Marksheet','12th Marksheet','Photo','Signature','Postcard Photo'],
 '{"general":1700,"obc":1600,"sc_st":1000,"female":1600}',
 '{"width":413,"height":531,"minKB":10,"maxKB":200,"format":"jpg","bg":"white"}',
 '{"width":413,"height":177,"minKB":4,"maxKB":30,"format":"jpg","bg":"white"}'),

('Passport Application', 'Passport', 'Passport Seva', 'https://www.passportindia.gov.in',
 ARRAY['passport','psk','travel document','passport seva'],
 ARRAY['Aadhaar','Birth Certificate','Address Proof','Photo'],
 '{"general":1500,"minor":1000}',
 '{"width":600,"height":600,"minKB":10,"maxKB":300,"format":"jpg","bg":"white"}',
 NULL),

('IBPS Probationary Officer', 'IBPS PO', 'IBPS', 'https://www.ibps.in',
 ARRAY['ibps','po','bank','probationary officer','banking'],
 ARRAY['Aadhaar','Graduation Marksheet','Photo','Signature','Thumb Impression','Handwriting'],
 '{"general":850,"obc":850,"sc_st":175,"female":175}',
 '{"width":200,"height":230,"minKB":20,"maxKB":50,"format":"jpg","bg":"white"}',
 '{"width":140,"height":60,"minKB":10,"maxKB":20,"format":"jpg","bg":"white"}'),

('IBPS Clerk', 'IBPS Clerk', 'IBPS', 'https://www.ibps.in',
 ARRAY['ibps','clerk','bank','banking clerk'],
 ARRAY['Aadhaar','Graduation Marksheet','Photo','Signature','Thumb Impression','Handwriting'],
 '{"general":850,"obc":850,"sc_st":175,"female":175}',
 '{"width":200,"height":230,"minKB":20,"maxKB":50,"format":"jpg","bg":"white"}',
 '{"width":140,"height":60,"minKB":10,"maxKB":20,"format":"jpg","bg":"white"}'),

('Bihar Board 10th Registration', 'BSEB 10th', 'Bihar Board', 'https://secondary.biharboardonline.com',
 ARRAY['bihar','bseb','10th','matric','board','secondary'],
 ARRAY['Aadhaar','School Certificate','Photo','Signature'],
 '{"general":0}',
 '{"width":200,"height":230,"minKB":50,"maxKB":100,"format":"jpg","bg":"white"}',
 '{"width":200,"height":70,"minKB":20,"maxKB":50,"format":"jpg","bg":"white"}'),

('PAN Card Application', 'PAN Card', 'NSDL/UTI', 'https://www.onlineservices.nsdl.com',
 ARRAY['pan','pan card','income tax','nsdl','tax'],
 ARRAY['Aadhaar','Photo','Signature','Address Proof'],
 '{"general":107}',
 '{"width":213,"height":213,"minKB":10,"maxKB":100,"format":"jpg","bg":"white"}',
 '{"width":213,"height":107,"minKB":10,"maxKB":100,"format":"jpg","bg":"white"}'),

('Indian Army Agniveer', 'Army Agniveer', 'Indian Army', 'https://joinindianarmy.nic.in',
 ARRAY['army','agniveer','agnipath','defence','soldier','gd'],
 ARRAY['Aadhaar','10th Marksheet','Photo','Signature','Domicile'],
 '{"general":250}',
 '{"width":413,"height":531,"minKB":10,"maxKB":50,"format":"jpg","bg":"white"}',
 '{"width":413,"height":177,"minKB":10,"maxKB":20,"format":"jpg","bg":"white"}'),

('Voter ID Registration', 'Voter ID', 'NVSP', 'https://voters.eci.gov.in',
 ARRAY['voter','voter id','epic','election','nvsp','form 6'],
 ARRAY['Aadhaar','Age Proof','Address Proof','Photo'],
 '{"general":0}',
 '{"width":177,"height":236,"minKB":10,"maxKB":100,"format":"jpg","bg":"white"}',
 NULL)

ON CONFLICT DO NOTHING;
