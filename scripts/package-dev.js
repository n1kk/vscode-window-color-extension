#!/usr/bin/env node
/**
 * Packages a dev build that can be installed *alongside* the published one.
 *
 * Beyond the name, the command and setting ids have to differ too: VS Code
 * throws when two extensions register the same command id, so an unrenamed dev
 * build would simply fail to activate whenever the real one is installed.
 *
 * The bundle goes to its own outfile rather than `dist/extension.js`, because
 * `pnpm run watch` owns that path and restores it whenever it changes — patching
 * it in place is a race the watcher wins. `package.json` is patched in place and
 * restored in `finally`, so the working tree is left as it was found.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'package.json');
const IGNORE = path.join(ROOT, '.vscodeignore');
const DEV_BUNDLE = 'dist/extension.dev.js';

/** Prefix shared by every command id, the webview view type, and the setting. */
const NAMESPACE = /windowColor\./g;
const DEV_NAMESPACE = 'windowColorDev.';
const DEV_TAG = '[DEV]';

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

run('pnpm', ['run', 'check-types']);
run('node', ['esbuild.js', '--production', `--outfile=${DEV_BUNDLE}`]);

const bundlePath = path.join(ROOT, DEV_BUNDLE);
fs.writeFileSync(bundlePath, fs.readFileSync(bundlePath, 'utf8').replace(NAMESPACE, DEV_NAMESPACE));

const originalManifest = fs.readFileSync(MANIFEST, 'utf8');
const originalIgnore = fs.readFileSync(IGNORE, 'utf8');

try {
  // The normal bundle is dead weight here, since `main` points at the dev one.
  fs.writeFileSync(IGNORE, `${originalIgnore}dist/extension.js\n`);

  const manifest = JSON.parse(originalManifest.replace(NAMESPACE, DEV_NAMESPACE));
  manifest.name = `${manifest.name}-dev`;
  manifest.displayName = `${manifest.displayName} ${DEV_TAG}`;
  manifest.main = `./${DEV_BUNDLE}`;
  for (const command of manifest.contributes.commands) {
    command.category = `${command.category} ${DEV_TAG}`;
  }
  // Already built above, and re-running it would not produce the dev bundle.
  delete manifest.scripts['vscode:prepublish'];

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  run('pnpm', ['exec', 'vsce', 'package', '--no-dependencies']);

  const vsix = `${manifest.name}-${manifest.version}.vsix`;
  console.log(`\nPackaged ${vsix}`);
  console.log(`Install with: code --install-extension ${vsix} --force`);
} finally {
  fs.writeFileSync(MANIFEST, originalManifest);
  fs.writeFileSync(IGNORE, originalIgnore);
  fs.rmSync(bundlePath, { force: true });
}
