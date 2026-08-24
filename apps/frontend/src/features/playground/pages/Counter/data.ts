/**
 * Sample data for Counter mock (no real API calls).
 * Realistic placeholder content per UI engineering guide.
 */

export type WorkRowTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type WorkRow = {
  id: string;
  name: string;
  service: string;
  state: string;
  tone?: WorkRowTone;
  when: string;
};

export const workstack: { pinned: WorkRow[]; active: WorkRow[]; waiting: WorkRow[] } = {
  pinned: [
    { id: 'p1', name: 'Mohan Das', service: 'Residence Certificate', state: 'photo missing', tone: 'warning', when: '6m' },
  ],
  active: [
    { id: 'a1', name: 'Priya Devi', service: 'SSC CGL', state: 'portal captcha', tone: 'danger', when: '2m' },
    { id: 'a2', name: 'Suresh Ram', service: 'PAN Application', state: 'docs arrived', tone: 'info', when: 'now' },
    { id: 'a3', name: 'Anjali Patel', service: 'Photo · 8 copies', state: 'ready to print', tone: 'success', when: '4m' },
    { id: 'a4', name: 'Vikash Singh', service: 'Driving Licence', state: 'profile filled', tone: 'neutral', when: '11m' },
  ],
  waiting: [
    { id: 'w1', name: 'Manish Kumar', service: 'Caste Certificate', state: 'awaiting OTP', when: '24m' },
    { id: 'w2', name: 'Geeta Mishra', service: 'Income Certificate', state: 'awaiting bill', when: '47m' },
    { id: 'w3', name: 'Rajan Lal', service: 'Voter ID Update', state: 'awaiting Aadhaar', when: '1h' },
  ],
};

export type ModuleState = 'done' | 'pending' | 'idle';
export type Module = {
  key: string;
  label: string;
  state: ModuleState;
  summary: string;
  items?: string[];
};

export const focused = {
  customer: 'Mohan Das',
  phone: '+91 90123 45678',
  service: 'Bihar Residence Certificate',
  cost: 150,
  status: 'photo missing',
  modules: [
    { key: 'docs', label: 'Documents', state: 'done', summary: '4 of 4 received', items: ['Aadhaar', 'Voter ID', 'Electricity bill', 'Self-declaration'] },
    { key: 'profile', label: 'Profile', state: 'done', summary: 'Mohan Das · 14 Aug 1996 · Patna' },
    { key: 'photo', label: 'Photo', state: 'pending', summary: 'Asked customer 6m ago via WhatsApp' },
    { key: 'portal', label: 'Portal', state: 'idle', summary: 'serviceonline.bihar.gov.in' },
    { key: 'submit', label: 'Submission', state: 'idle', summary: 'Pending portal step' },
  ] satisfies Module[],
  recent: [
    { time: 'Just now', text: 'Photo request sent via WhatsApp' },
    { time: '14:25', text: 'Profile auto-filled from Aadhaar' },
    { time: '14:22', text: 'Aadhaar (back) received' },
    { time: '14:18', text: 'Work item created' },
  ],
};

export type IntakeItem = {
  who: string;
  file: string;
  kind: 'photo' | 'pdf';
  size: string;
  match?: string;
  unknown?: boolean;
  when: string;
};

export const intake: IntakeItem[] = [
  { who: 'Mohan Das', file: 'IMG-WA341.jpg', kind: 'photo', size: '1.2 MB', match: 'Mohan · Residence Cert', when: 'now' },
  { who: 'Priya Devi', file: 'marksheet.pdf', kind: 'pdf', size: '612 KB', match: 'Priya · SSC CGL', when: '1m' },
  { who: 'Suresh Ram', file: 'aadhaar-back.jpg', kind: 'photo', size: '184 KB', when: '2m' },
  { who: '+91 70021 88475', file: 'bill-may.pdf', kind: 'pdf', size: '92 KB', unknown: true, when: '5m' },
  { who: 'Anjali Patel', file: 'photo.jpg', kind: 'photo', size: '320 KB', match: 'Anjali · Photo · 8', when: '7m' },
];
