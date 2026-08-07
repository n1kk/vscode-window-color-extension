#!/usr/bin/env node
/**
 * Builds a .vsix without needing the watch task stopped first.
 *
 * `pnpm run watch` owns dist/extension.js and restores it whenever something
 * else writes there — including right after a production build — so packaging
 * could ship the unminified dev bundle. Rather than rely on remembering, this
 * builds to its own outfile, points `main` at that, and hides the watched file
 * from the package. The race is removed instead of avoided.
 *
 * `--dev` also gives the result a separate identity so it can be installed
 * alongside the published extension.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dev = process.argv.includes("--dev");

const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(ROOT, "package.json");
const IGNORE = path.join(ROOT, ".vscodeignore");
const WATCHED_BUNDLE = "dist/extension.js";
const BUNDLE = dev ? "dist/extension.dev.js" : "dist/extension.pkg.js";

/** Prefix shared by every command id, the webview view type, and the setting. */
const NAMESPACE = /windowColor\./g;
const DEV_NAMESPACE = "windowColorDev.";
const DEV_TAG = "[DEV]";

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit" });
}

run("pnpm", ["run", "check-types"]);
run("node", ["esbuild.js", "--production", `--outfile=${BUNDLE}`]);

const bundlePath = path.join(ROOT, BUNDLE);
if (dev) {
  // VS Code throws when two extensions register the same command id, so a dev
  // build that kept them would fail to activate alongside the published one.
  const built = fs.readFileSync(bundlePath, "utf8");
  fs.writeFileSync(bundlePath, built.replace(NAMESPACE, DEV_NAMESPACE));
}

const originalManifest = fs.readFileSync(MANIFEST, "utf8");
const originalIgnore = fs.readFileSync(IGNORE, "utf8");

try {
  fs.writeFileSync(IGNORE, `${originalIgnore}${WATCHED_BUNDLE}\n`);

  const source = dev ? originalManifest.replace(NAMESPACE, DEV_NAMESPACE) : originalManifest;
  const manifest = JSON.parse(source);
  manifest.main = `./${BUNDLE}`;
  // Already built above, and re-running it would write to the watched path.
  delete manifest.scripts["vscode:prepublish"];

  if (dev) {
    manifest.name = `${manifest.name}-dev`;
    manifest.displayName = `${manifest.displayName} ${DEV_TAG}`;
    for (const command of manifest.contributes.commands) {
      command.category = `${command.category} ${DEV_TAG}`;
    }
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  run("pnpm", ["exec", "vsce", "package", "--no-dependencies"]);

  const vsix = `${manifest.name}-${manifest.version}.vsix`;
  console.log(`\nPackaged ${vsix}`);
  console.log(
    dev
      ? `Install with: code --install-extension ${vsix} --force`
      : `Publish with: pnpm exec vsce publish --packagePath ${vsix}`,
  );
} finally {
  fs.writeFileSync(MANIFEST, originalManifest);
  fs.writeFileSync(IGNORE, originalIgnore);
  fs.rmSync(bundlePath, { force: true });
}
