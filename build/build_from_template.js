// Entire build pipeline: merge a static data snapshot into an HTML template.
// No bundler, no transpiler -- the shipped game is "open this HTML file and
// it works," so the only thing that needs a build step is baking the data
// blob in as a JSON literal instead of fetching it at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '..', 'app');
const templatePath = path.join(appDir, 'index.template.html');
const dataPath = path.join(appDir, 'data', 'snapshot.json');
const outPath = path.join(appDir, 'index.html');

const template = fs.readFileSync(templatePath, 'utf8');
const dataJson = fs.readFileSync(dataPath, 'utf8');

const PLACEHOLDER = '__DATA_SNAPSHOT_JSON__';
if (!template.includes(PLACEHOLDER)) {
  throw new Error(`index.template.html is missing the ${PLACEHOLDER} placeholder`);
}

const output = template.replace(PLACEHOLDER, dataJson);
fs.writeFileSync(outPath, output);
console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

// Convention: `npm run build` runs this, then `npm test` runs the harness in
// testing/example_checks.js against the FRESH build. The two are always run
// together -- testing against a stale build (edited the template, forgot to
// rebuild) produces confusing "function is not defined" failures for a
// freshly-added export that only exists in the not-yet-built template.
