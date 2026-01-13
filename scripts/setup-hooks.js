#!/usr/bin/env node
/**
 * Git hooks setup script
 * Copies hooks from scripts/hooks/ to .git/hooks/
 */

const fs = require('fs');
const path = require('path');

const HOOKS_SOURCE = path.join(__dirname, 'hooks');
const HOOKS_DEST = path.join(__dirname, '..', '.git', 'hooks');

const HOOKS = ['pre-commit', 'commit-msg', 'pre-push'];

console.log('Setting up Git hooks...\n');

// Check if .git directory exists
if (!fs.existsSync(path.join(__dirname, '..', '.git'))) {
  console.error('Error: .git directory not found. Are you in a Git repository?');
  process.exit(1);
}

// Create hooks destination if it doesn't exist
if (!fs.existsSync(HOOKS_DEST)) {
  fs.mkdirSync(HOOKS_DEST, { recursive: true });
}

// Copy each hook
for (const hook of HOOKS) {
  const source = path.join(HOOKS_SOURCE, hook);
  const dest = path.join(HOOKS_DEST, hook);

  if (!fs.existsSync(source)) {
    console.warn(`Warning: Hook source not found: ${source}`);
    continue;
  }

  try {
    // Read source file
    const content = fs.readFileSync(source, 'utf8');

    // Write to destination
    fs.writeFileSync(dest, content, { mode: 0o755 });

    // Try to set executable permission (may fail on Windows)
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      // Ignore chmod errors on Windows
    }

    console.log(`Installed: ${hook}`);
  } catch (err) {
    console.error(`Error installing ${hook}: ${err.message}`);
  }
}

console.log('\nGit hooks setup complete!');
console.log('Hooks will run automatically on commit and push.');
