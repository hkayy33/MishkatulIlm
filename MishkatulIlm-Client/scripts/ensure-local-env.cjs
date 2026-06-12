'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  {
    rel: 'src/environments/environment.development.local.ts',
    body:
      "// Gitignored — local dev secrets.\n" +
      'export const localDevSecrets = {\n' +
      '  supabaseAnonKey: \'\',\n' +
      "  /** Override for phone/LAN testing (e.g. http://192.168.x.x:4200); desktop dev uses localhost. */\n" +
      '  authRedirectOrigin: \'http://localhost:4200\',\n' +
      '};\n',
  },
  {
    rel: 'src/environments/environment.prod.local.ts',
    body:
      "// Gitignored — set before production deploy (same anon key as Dashboard, or build-time secret).\n" +
      'export const prodSecrets = {\n  supabaseAnonKey: \'\',\n};\n',
  },
];

for (const { rel, body } of files) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, 'utf8');
  }
}
