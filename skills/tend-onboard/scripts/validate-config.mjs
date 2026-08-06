#!/usr/bin/env node
/**
 * Validates .claude/tend/config.yaml against the schema in
 * references/config-schema.md — the single source of truth for the rules
 * below; do not duplicate the shape description in prose elsewhere.
 *
 * Zero dependencies. Hand-parses the deliberately constrained YAML subset
 * this schema uses (2 levels of nesting, flat string lists, no anchors, no
 * multiline scalars) rather than pulling in a full YAML library.
 *
 * Usage: node validate-config.mjs <path-to-config.yaml>
 * Exits 0 on pass, 1 on failure.
 */

import fs from "node:fs";

const SKILL_NAMES = new Set(["security", "perf", "refactor", "a11y", "tests"]);
const MODULE_NAMES = new Set(["data", "validation", "realtime", "auth", "feature-flags"]);
const SKILL_FIELDS = new Set(["off-limits", "notes"]);

const args = process.argv.slice(2);
const file = args[0];

if (!file) {
  console.error("Usage: node validate-config.mjs <config.yaml>");
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(`Failed to read ${file}: ${e.message}`);
  process.exit(1);
}

const errors = [];

function stripComment(line) {
  // No quoted-string support needed for this grammar — values are bare identifiers.
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

function parseFlowList(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

// --- Tokenize into {indent, key, value, isListItem} lines ---

const lines = raw
  .split("\n")
  .map(stripComment)
  .map((l) => l.replace(/\s+$/, ""))
  .filter((l) => l.trim() !== "");

let i = 0;

function peek() {
  return lines[i];
}

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function parseBlockList(baseIndent) {
  const items = [];
  while (i < lines.length) {
    const line = lines[i];
    const indent = indentOf(line);
    if (indent !== baseIndent || !line.trim().startsWith("- ")) break;
    items.push(line.trim().slice(2).trim().replace(/^["']|["']$/g, ""));
    i++;
  }
  return items;
}

function parseListValue(inlineValue, itemIndent) {
  const flow = parseFlowList(inlineValue);
  if (flow !== null) return flow;
  if (inlineValue.trim() !== "") {
    errors.push(`Expected a list ([] or block items), got: "${inlineValue.trim()}"`);
    return [];
  }
  return parseBlockList(itemIndent);
}

function parseSkillBlock(indent) {
  const skill = {};
  while (i < lines.length) {
    const line = lines[i];
    const lineIndent = indentOf(line);
    if (lineIndent !== indent) break;
    const m = line.trim().match(/^([\w-]+):\s*(.*)$/);
    if (!m) {
      errors.push(`Malformed line under skill entry: "${line.trim()}"`);
      i++;
      continue;
    }
    const [, field, value] = m;
    if (!SKILL_FIELDS.has(field)) {
      errors.push(`Unknown field "${field}" in a skill entry — allowed: ${[...SKILL_FIELDS].join(", ")}`);
    }
    i++;
    skill[field] = parseListValue(value, indent + 2);
  }
  return skill;
}

function parseSkillsBlock(indent) {
  const skills = {};
  while (i < lines.length) {
    const line = lines[i];
    const lineIndent = indentOf(line);
    if (lineIndent !== indent) break;
    const m = line.trim().match(/^([\w-]+):\s*$/);
    if (!m) {
      errors.push(`Expected a skill name key under "skills:", got: "${line.trim()}"`);
      i++;
      continue;
    }
    const name = m[1];
    if (!SKILL_NAMES.has(name)) {
      errors.push(`Unknown skill "${name}" under "skills:" — allowed: ${[...SKILL_NAMES].join(", ")}`);
    }
    i++;
    skills[name] = parseSkillBlock(indent + 2);
  }
  return skills;
}

// --- Top level ---

const doc = {};

while (i < lines.length) {
  const line = lines[i];
  const indent = indentOf(line);
  if (indent !== 0) {
    errors.push(`Unexpected indentation at top level: "${line}"`);
    i++;
    continue;
  }
  const m = line.trim().match(/^([\w-]+):\s*(.*)$/);
  if (!m) {
    errors.push(`Malformed top-level line: "${line.trim()}"`);
    i++;
    continue;
  }
  const [, key, value] = m;
  if (key === "skills") {
    if (value.trim() !== "") {
      errors.push(`"skills:" must be a block (skill names on following lines), not an inline value`);
      i++;
      continue;
    }
    i++;
    doc.skills = parseSkillsBlock(2);
  } else if (key === "modules") {
    i++;
    doc.modules = parseListValue(value, 2);
  } else {
    errors.push(`Unknown top-level key "${key}" — allowed: skills, modules`);
    i++;
  }
}

// --- Semantic checks ---

if (doc.modules) {
  for (const m of doc.modules) {
    if (!MODULE_NAMES.has(m)) {
      errors.push(`Unknown module "${m}" in "modules:" — allowed: ${[...MODULE_NAMES].join(", ")}`);
    }
  }
}

if (doc.skills) {
  for (const [name, skill] of Object.entries(doc.skills)) {
    for (const field of ["off-limits", "notes"]) {
      if (skill[field] && !Array.isArray(skill[field])) {
        errors.push(`"skills.${name}.${field}" must be a list`);
      }
    }
  }
}

if (errors.length === 0) {
  console.log(`PASS — ${file} is a valid tend config`);
  process.exit(0);
} else {
  for (const e of errors) console.error("  ERROR:", e);
  console.error(`FAIL — ${errors.length} error(s)`);
  process.exit(1);
}
