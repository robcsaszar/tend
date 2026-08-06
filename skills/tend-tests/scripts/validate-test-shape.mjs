#!/usr/bin/env node
/**
 * Validates that a newly-written (or newly-appended-to) test file actually
 * exercises its target function, rather than reporting green coverage for
 * a file that was copy-pasted and never rewired.
 *
 * Checks, in order:
 *   1. The file exists and is readable.
 *   2. The file references the target function name (import or direct call).
 *   3. There are at least two it(/test( blocks.
 *   4. At least one block's title looks like a happy-path test (does not
 *      match edge-case keywords).
 *   5. At least one block's title or body matches edge-case keywords
 *      (throw, error, invalid, null, undefined, empty, edge, fail, reject,
 *      boundary, out of range).
 *   6. At least one expect(/assert( call exists somewhere in the file.
 *
 * Targets JS/TS test files written in the Vitest/Jest `describe`/`it`/`test`
 * style — this is a shape/heuristic check, not a type-checker or a real
 * test run. Zero dependencies, Node built-ins only.
 *
 * Usage: node validate-test-shape.mjs <test-file> <target-function-name>
 * Exits 0 on pass, 1 on failure.
 */

import fs from "node:fs";

const EDGE_CASE_KEYWORDS =
  /\b(throw|throws|error|errors|invalid|null|undefined|empty|edge|fail|fails|failure|reject|rejects|boundary|out[\s-]of[\s-]range)\b/i;

const TEST_BLOCK_RE = /\b(it|test)\s*(?:\.(?:only|skip|each\([^)]*\)))?\s*\(\s*(['"`])((?:(?!\2).)*)\2/g;

const args = process.argv.slice(2);
const [file, functionName] = args;

if (!file || !functionName) {
  console.error("Usage: node validate-test-shape.mjs <test-file> <target-function-name>");
  process.exit(1);
}

const errors = [];

let text;
try {
  text = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(`Failed to read ${file}: ${e.message}`);
  process.exit(1);
}

// --- 2. References the target function ---

const importRe = new RegExp(`\\b${escapeRegExp(functionName)}\\b`);
if (!importRe.test(text)) {
  errors.push(`file does not reference "${functionName}" anywhere (no import or call found)`);
}

const callRe = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(`);
if (!callRe.test(text)) {
  errors.push(`"${functionName}" is referenced but never called — an import with no invocation is not a test`);
}

// --- 3-5. Test block shape ---

const blocks = [];
let m;
TEST_BLOCK_RE.lastIndex = 0;
while ((m = TEST_BLOCK_RE.exec(text)) !== null) {
  const title = m[3];
  const bodyStart = m.index + m[0].length;
  const bodyEnd = findBlockEnd(text, bodyStart);
  const body = text.slice(bodyStart, bodyEnd);
  blocks.push({ title, body });
}

if (blocks.length < 2) {
  errors.push(`expected at least 2 it(/test( blocks, found ${blocks.length}`);
}

const hasHappyPath = blocks.some((b) => !EDGE_CASE_KEYWORDS.test(b.title));
if (!hasHappyPath) {
  errors.push("no block looks like a happy-path test (every title matches an edge-case keyword)");
}

const hasEdgeCase = blocks.some((b) => EDGE_CASE_KEYWORDS.test(b.title) || EDGE_CASE_KEYWORDS.test(b.body));
if (!hasEdgeCase) {
  errors.push(
    `no block looks like an edge/error-path test — expected a title or body matching one of: throw, error, invalid, null, undefined, empty, edge, fail, reject, boundary, out of range`,
  );
}

// --- 6. At least one real assertion ---

if (!/\b(expect|assert)\s*\(/.test(text)) {
  errors.push("no expect(/assert( call found anywhere in the file");
}

// --- Report ---

if (errors.length === 0) {
  console.log(`PASS — ${file} references "${functionName}", has ${blocks.length} test block(s) with a happy-path and an edge-case shape`);
  process.exit(0);
} else {
  for (const e of errors) console.error("  ERROR:", e);
  console.error(`FAIL — ${errors.length} error(s) in ${file}`);
  process.exit(1);
}

// --- Helpers ---

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Given the index just after an it(/test( block's opening `(`..title..`,`,
 * find where its callback body ends by brace-matching from the first `{`
 * after the title. Falls back to end-of-string if no balanced brace is found
 * (malformed file — the shape checks above will already have flagged it).
 */
function findBlockEnd(text, from) {
  const braceStart = text.indexOf("{", from);
  if (braceStart === -1) return Math.min(text.length, from + 2000);
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}
