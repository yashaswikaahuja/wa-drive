// Compares which secret actually verifies the issued JWT.
// Run on GCP#1: node /tmp/jwtdiag.cjs <token>
const jwt = require('/opt/extension-service/node_modules/jsonwebtoken');
const fs  = require('fs');
const token = process.argv[2];
if (!token) { console.error('usage: node jwtdiag.cjs <jwt>'); process.exit(1); }

const tries = {
  'extension-service .env': fs.readFileSync('/opt/extension-service/.env','utf8'),
  'hub .env':               fs.readFileSync('/opt/cybercontrol-hub/backend/.env','utf8'),
};
for (const [label, content] of Object.entries(tries)) {
  const m = content.match(/^JWT_SECRET=(.+)$/m);
  const secret = m ? m[1] : null;
  process.stdout.write(label + ' (len=' + (secret||'').length + '): ');
  if (!secret) { console.log('no JWT_SECRET in file'); continue; }
  try { jwt.verify(token, secret); console.log('OK ✓'); }
  catch (e) { console.log('FAIL —', e.message); }
}
console.log('hardcoded fallback "dev-secret-change-me":');
try { jwt.verify(token, 'dev-secret-change-me'); console.log('OK ✓'); }
catch (e) { console.log('  FAIL —', e.message); }
