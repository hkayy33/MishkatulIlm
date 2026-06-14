'use strict';

const fs = require('fs');
const path = require('path');

/** Matches macOS Finder duplicates like "file 2.ts" or "component.spec 2.ts". */
const FINDER_DUPLICATE = / \d+(?=\.[^.]+$)/;

const srcRoot = path.join(__dirname, '..', 'src');

function collectFinderDuplicates(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFinderDuplicates(fullPath, found);
      continue;
    }
    if (FINDER_DUPLICATE.test(entry.name)) {
      found.push(fullPath);
    }
  }
  return found;
}

if (!fs.existsSync(srcRoot)) {
  process.exit(0);
}

const duplicates = collectFinderDuplicates(srcRoot);
if (!duplicates.length) {
  process.exit(0);
}

const projectRoot = path.join(__dirname, '..');
console.warn('Removing macOS Finder duplicate files:');
for (const filePath of duplicates) {
  console.warn(`  - ${path.relative(projectRoot, filePath)}`);
  fs.unlinkSync(filePath);
}
