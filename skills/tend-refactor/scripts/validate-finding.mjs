#!/usr/bin/env node
/**
 * Validates a single tend-refactor finding against
 * assets/finding-schema.json, then machine-checks it against the actual
 * repo on disk: the target file(s) exist, the line number(s) are within
 * each file's real line count, and the evidence/fix/verify fields carry
 * real content rather than placeholder text.
 *
 * tend-refactor reports exactly ONE finding per run (see SKILL.md §4),
 * so — like tend-security's validate-finding.mjs, and unlike
 * run-crucible's validate-findings.cjs, which validates an array — this
 * validates a single JSON object.
 *
 * Unlike tend-security's single fixed shape, a refactor finding is one
 * of three `kind`s (dead-code-removal, type-tightening, component-extraction).
 * The generic schema interpreter below has no conditional/if-then support,
 * so kind-specific rules (component-extraction needs 2+ `instances`, each
 * of which must exist on disk) are enforced as Layer 2 checks, the same
 * way file-existence and line-range checks are — not inside the schema
 * itself.
 *
 * Reads the schema at runtime from ../assets/finding-schema.json — that
 * file is the single source of truth for shape; do not duplicate its
 * rules here beyond what's needed to interpret it.
 *
 * Usage: node validate-finding.mjs <finding.json> [--repo-root <path>]
 * Exits 0 on pass, 1 on failure. Zero dependencies, Node built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const repoRootFlagIndex = args.indexOf("--repo-root");
const repoRoot = repoRootFlagIndex !== -1 ? args[repoRootFlagIndex + 1] : process.cwd();

if (!file) {
  console.error("Usage: node validate-finding.mjs <finding.json> [--repo-root <path>]");
  process.exit(1);
}

// --- Load schema ---

const schemaPath = path.join(__dirname, "..", "assets", "finding-schema.json");
let schema;
try {
  const doc = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  schema = doc.output_schema;
  if (!schema) throw new Error("finding-schema.json missing output_schema");
} catch (e) {
  console.error(`Failed to load schema: ${e.message}`);
  process.exit(1);
}

// --- Load finding ---

let finding;
try {
  finding = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Failed to parse JSON from ${file}: ${e.message}`);
  process.exit(1);
}

if (typeof finding !== "object" || finding === null || Array.isArray(finding)) {
  console.error("finding must be a single JSON object, not an array or primitive");
  process.exit(1);
}

const errors = [];

// --- Layer 1: structural shape against the schema ---

validateShape(finding, schema, "finding", errors);

// --- Layer 2: machine-check against the real repo (only if shape passed enough to try) ---

checkFileAndLine(finding.file, finding.line, "finding.file", "finding.line", errors);

// kind-specific: component-extraction needs 2+ instances, each checked on disk.
// The other two kinds should not carry an `instances` array at all — it's
// meaningless for a single-file fix and its presence usually means the
// finding was assembled from the wrong template.
if (finding.kind === "component-extraction") {
  if (!Array.isArray(finding.instances) || finding.instances.length < 2) {
    errors.push(
      "finding.instances: component-extraction requires 2+ replaced call sites — minimum 2 instances (scan-core.md §3 hard requirement)",
    );
  } else {
    finding.instances.forEach((inst, i) => {
      if (typeof inst === "object" && inst !== null) {
        checkFileAndLine(inst.file, inst.line, `finding.instances[${i}].file`, `finding.instances[${i}].line`, errors);
      }
    });
  }
} else if (finding.instances !== undefined) {
  errors.push(
    `finding.instances: not applicable to kind "${finding.kind}" — only component-extraction findings carry an instances list`,
  );
}

// evidence-present checks beyond bare minLength: reject evidence that's just
// a restatement of the title, or evidence identical to the fix description.
if (
  typeof finding.evidence === "string" &&
  typeof finding.fix === "string" &&
  finding.evidence.trim().length > 0 &&
  finding.evidence.trim() === finding.fix.trim()
) {
  errors.push("finding.evidence and finding.fix are identical — proof of mechanical validity and the fix applied must be described independently");
}

if (
  typeof finding.title === "string" &&
  typeof finding.evidence === "string" &&
  finding.evidence.trim().length > 0 &&
  finding.evidence.trim() === finding.title.trim()
) {
  errors.push("finding.evidence is identical to finding.title — evidence must describe the concrete proof (grep hits, reused type, verified instances), not restate the title");
}

// --- Report ---

if (errors.length === 0) {
  console.log(
    `PASS — ${file}: "${finding.title}" (${finding.kind}) at ${finding.file}:${finding.line} — file(s) exist, line(s) in range, evidence present`,
  );
  process.exit(0);
} else {
  for (const e of errors) console.error("  ERROR:", e);
  console.error(`FAIL — ${errors.length} error(s) in ${file}`);
  process.exit(1);
}

// --- Helpers ---

function checkFileAndLine(fileVal, lineVal, filePath, lineLabel, errs) {
  if (typeof fileVal !== "string" || fileVal.length === 0) return;
  const resolved = path.resolve(repoRoot, fileVal);
  if (!fs.existsSync(resolved)) {
    errs.push(`${filePath}: "${fileVal}" does not exist (resolved to ${resolved})`);
    return;
  }
  if (!fs.statSync(resolved).isFile()) {
    errs.push(`${filePath}: "${fileVal}" exists but is not a file`);
    return;
  }
  if (Number.isInteger(lineVal)) {
    const lineCount = fs.readFileSync(resolved, "utf8").split("\n").length;
    if (lineVal > lineCount) {
      errs.push(`${lineLabel}: ${lineVal} is past the end of "${fileVal}" (file has ${lineCount} line(s))`);
    }
  }
}

// --- Schema interpreter (subset used by finding-schema.json: type, enum, required,
//     minLength, minimum, additionalProperties, plus array/items/minItems for
//     the `instances` field) ---

function typeOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}

function validateShape(value, s, p, errs) {
  if (s.enum && !s.enum.includes(value)) {
    errs.push(`${p}: invalid value ${JSON.stringify(value)} (allowed: ${s.enum.map((v) => JSON.stringify(v)).join(", ")})`);
  }

  switch (s.type) {
    case "object": {
      if (typeOf(value) !== "object") {
        errs.push(`${p}: expected object, got ${typeOf(value)}`);
        return;
      }
      for (const req of s.required || []) {
        if (!(req in value)) errs.push(`${p}: missing required field "${req}"`);
      }
      for (const key of Object.keys(value)) {
        if (s.properties && key in s.properties) {
          validateShape(value[key], s.properties[key], `${p}.${key}`, errs);
        } else if (s.additionalProperties === false) {
          errs.push(`${p}: unexpected field "${key}"`);
        }
      }
      break;
    }
    case "array": {
      if (typeOf(value) !== "array") {
        errs.push(`${p}: expected array, got ${typeOf(value)}`);
        return;
      }
      if (typeof s.minItems === "number" && value.length < s.minItems) {
        errs.push(`${p}: must have at least ${s.minItems} item(s), got ${value.length}`);
      }
      if (s.items) {
        value.forEach((item, i) => validateShape(item, s.items, `${p}[${i}]`, errs));
      }
      break;
    }
    case "string":
      if (typeOf(value) !== "string") {
        errs.push(`${p}: expected string, got ${typeOf(value)}`);
      } else if (typeof s.minLength === "number" && value.length < s.minLength) {
        errs.push(`${p}: must be at least ${s.minLength} chars, got ${value.length} ("${value}")`);
      }
      break;
    case "integer":
      if (typeOf(value) !== "number" || !Number.isInteger(value)) {
        errs.push(`${p}: expected integer, got ${typeOf(value)}`);
      } else if (typeof s.minimum === "number" && value < s.minimum) {
        errs.push(`${p}: must be >= ${s.minimum}, got ${value}`);
      }
      break;
  }
}
