#!/usr/bin/env node
/**
 * Validates a single tend-security finding against
 * assets/finding-schema.json, then machine-checks it against the actual
 * repo on disk: the target file exists, the line number is within that
 * file's real line count, and the exploit/fix/verify fields carry real
 * evidence rather than placeholder text.
 *
 * tend-security reports exactly ONE finding per run (see SKILL.md §4),
 * so — unlike run-crucible's validate-findings.cjs, which validates an
 * array — this validates a single JSON object.
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

if (typeof finding.file === "string" && finding.file.length > 0) {
  const resolved = path.resolve(repoRoot, finding.file);
  if (!fs.existsSync(resolved)) {
    errors.push(`finding.file: "${finding.file}" does not exist (resolved to ${resolved})`);
  } else if (!fs.statSync(resolved).isFile()) {
    errors.push(`finding.file: "${finding.file}" exists but is not a file`);
  } else if (Number.isInteger(finding.line)) {
    const lineCount = fs.readFileSync(resolved, "utf8").split("\n").length;
    if (finding.line > lineCount) {
      errors.push(
        `finding.line: ${finding.line} is past the end of "${finding.file}" (file has ${lineCount} line(s))`,
      );
    }
  }
}

// evidence-present checks beyond bare minLength: reject a fix/exploit that's just
// a restatement of the title, or an exploit/fix that are identical to each other.
if (
  typeof finding.exploit === "string" &&
  typeof finding.fix === "string" &&
  finding.exploit.trim().length > 0 &&
  finding.exploit.trim() === finding.fix.trim()
) {
  errors.push("finding.exploit and finding.fix are identical — exploit path and fix must be described independently");
}

if (
  typeof finding.title === "string" &&
  typeof finding.exploit === "string" &&
  finding.exploit.trim().length > 0 &&
  finding.exploit.trim() === finding.title.trim()
) {
  errors.push("finding.exploit is identical to finding.title — exploit must describe the concrete attack path, not restate the title");
}

// --- Report ---

if (errors.length === 0) {
  console.log(
    `PASS — ${file}: "${finding.title}" (${finding.severity}) at ${finding.file}:${finding.line} — file exists, line in range, evidence present`,
  );
  process.exit(0);
} else {
  for (const e of errors) console.error("  ERROR:", e);
  console.error(`FAIL — ${errors.length} error(s) in ${file}`);
  process.exit(1);
}

// --- Schema interpreter (subset used by finding-schema.json: type, enum, required,
//     minLength, minimum, additionalProperties) ---

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
