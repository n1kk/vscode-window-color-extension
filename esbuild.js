const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
// A custom outfile keeps a build clear of the one `--watch` owns and restores.
const outfile =
  process.argv.find((arg) => arg.startsWith('--outfile='))?.slice('--outfile='.length) ??
  'dist/extension.js';

/** Reports build state in the format VS Code's `$esbuild-watch` problem matcher expects. */
const problemMatcherPlugin = {
  name: 'problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'silent',
};

/** Runs in the extension host: Node, with the vscode API provided at runtime. */
const extensionBuild = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile,
  external: ['vscode'],
  plugins: [problemMatcherPlugin],
};

/**
 * Runs in the webview: a browser context, loaded by media/picker.html as a plain
 * script. Its output is generated, so it is git-ignored while the html and css
 * beside it are sources.
 */
const webviewBuild = {
  ...shared,
  entryPoints: ['src/webview/picker.ts'],
  format: 'iife',
  platform: 'browser',
  target: 'chrome122',
  outfile: 'media/picker.js',
};

async function main() {
  const contexts = await Promise.all(
    [extensionBuild, webviewBuild].map((options) => esbuild.context(options)),
  );

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
