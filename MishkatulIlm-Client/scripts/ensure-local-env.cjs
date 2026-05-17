'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  {
    rel: 'src/environments/environment.development.local.ts',
    body:
      "// Gitignored — paste Supabase anon public key (Dashboard → Settings → API → anon public).\n" +
      'export const localDevSecrets = {\n  supabaseAnonKey: \'\',\n};\n',
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
