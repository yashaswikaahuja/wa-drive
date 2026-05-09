c = open('/opt/cybercontrol-hub/extension/autofill/mapper.js').read()

old = "    const isCandidateNameField = ident.includes('candidate_name') || ident.includes('candidates_name') || (ident.includes('name') && ident.includes('candidate'));\n    const isEducationRow = !isCandidateNameField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));"

new = "    const isCandidateNameField = ident.includes('candidate_name') || ident.includes('candidates_name') || (ident.includes('name') && ident.includes('candidate'));\n    // 'highest level of educational qualification' contains 'graduation' but is NOT an education row\n    const isHighestEduField = ident.includes('highest');\n    const isEducationRow = !isCandidateNameField && !isHighestEduField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));"

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/autofill/mapper.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
