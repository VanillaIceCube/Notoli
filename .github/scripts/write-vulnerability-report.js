"use strict";

const fs = require('node:fs');
const crypto = require('node:crypto');
const MAX_REPORT_BYTES = 16 * 1024;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;
// Native Dependency Review ChangeSchema uses added/removed:
// https://github.com/actions/dependency-review-action/blob/bbc44d14a204704ccc493733616cd1e93a0321ec/src/schemas.ts#L65-L85
// A native upgrade removes the old and adds the new. Also accept a consolidated
// updated record from compatible producers; it keeps identical evidence and
// severity validation and is never treated as a removal.
const CHANGE_TYPES = ['added', 'removed', 'updated'];

// Keep only the scanner fields needed for dependency decisions.
// Free text, arbitrary URLs and unexpected properties stay out of model context.
function text(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 2048 || /[\r\n\x00-\x1f]/.test(value) ||
      /(?:https?:\/\/|gh[pousr]_|github_pat_|sk-proj-|Bearer\s)/i.test(value)) {
    throw new Error('Invalid or sensitive dependency identity field');
  }
  return value;
}

function changes(value) {
  if (typeof value === 'string') {
    if (!value.trim()) throw new Error('Missing dependency scanner output');
    try { value = JSON.parse(value); } catch { throw new Error('Malformed dependency scanner JSON'); }
  }
  if (!Array.isArray(value)) throw new Error('Dependency review evidence must contain arrays');
  return value.map((change) => {
    if (!change || typeof change !== 'object' || Array.isArray(change)) throw new Error('Malformed dependency change');
    if (!change.name || !change.manifest || !CHANGE_TYPES.includes(change.change_type)) throw new Error('Incomplete dependency change identity');
    if (!Array.isArray(change.vulnerabilities)) throw new Error('Missing vulnerability evidence for dependency change');
    const result = {};
    for (const field of ['change_type', 'manifest', 'ecosystem', 'name', 'version', 'scope']) {
      const clean = text(change[field]);
      if (clean !== undefined) result[field] = clean;
    }
    if (change.vulnerabilities !== undefined) {
      if (!Array.isArray(change.vulnerabilities)) throw new Error('Malformed vulnerability list');
      result.vulnerabilities = change.vulnerabilities.map((vulnerability) => {
        if (!vulnerability || typeof vulnerability !== 'object') throw new Error('Malformed vulnerability');
        const severity = text(vulnerability.severity);
        if (!['low', 'moderate', 'medium', 'high', 'critical'].includes(severity)) throw new Error('Unknown vulnerability severity');
        const advisory = text(vulnerability.advisory_ghsa_id);
        return { severity, ...(advisory ? { advisory_ghsa_id: advisory } : {}) };
      });
    }
    return result;
  });
}

function normalizeEvidence(input) {
  const evidence = { schemaVersion: 1, outcome: ['success', 'failure', 'cancelled', 'skipped'].includes(input?.outcome) ? input.outcome : 'unknown', dependencyChanges: [], vulnerableChanges: [], errors: [] };
  try { evidence.dependencyChanges = changes(input?.dependencyChanges); } catch (error) { evidence.errors.push(error.message); }
  try { evidence.vulnerableChanges = changes(input?.vulnerableChanges); } catch (error) { evidence.errors.push(error.message); }
  // vulnerable-changes is the scanner's severity/scope/advisory-filtered output.
  // The unfiltered inventory can legitimately include excluded development
  // dependencies or allowed advisories; it must not redefine scanner policy.
  const blocking = evidence.vulnerableChanges.some((change) =>
    change.change_type !== 'removed' && change.vulnerabilities?.some((vulnerability) => ['high', 'critical'].includes(vulnerability.severity)));
  evidence.valid = evidence.errors.length === 0;
  evidence.passed = evidence.outcome === 'success' && evidence.valid && !blocking;
  if (blocking) evidence.errors.push('High or critical vulnerable dependency changes are present');
  return evidence;
}

function formatVulnerabilityReport(evidence) {
  const counts = Object.create(null);
  for (const change of evidence.dependencyChanges) {
    const key = CHANGE_TYPES.includes(change.change_type) ? change.change_type : 'other';
    counts[key] = (counts[key] || 0) + 1;
  }
  const lines = [evidence.passed
    ? 'Dependency Review completed without high or critical vulnerable dependency changes.'
    : `Dependency Review did not pass (outcome: ${evidence.outcome}). Scanner completion and valid evidence are required.`,
  `Dependency changes: ${JSON.stringify(counts)}`, `Vulnerable changes: ${evidence.vulnerableChanges.length}`,
  ...evidence.errors];
  let omitted = 0;
  for (const change of evidence.vulnerableChanges) {
    const line = JSON.stringify(change);
    // Reserve bytes for the footer so the entire report fits the contract.
    if (Buffer.byteLength([...lines, line].join('\n')) > MAX_REPORT_BYTES - 256) omitted++;
    else lines.push(line);
  }
  lines.push(`Omitted vulnerable entries: ${omitted}.`);
  return lines.join('\n');
}

function readBoundedEvidence(descriptor) {
  const chunks = [];
  let total = 0;
  while (total <= MAX_INPUT_BYTES) {
    const buffer = Buffer.alloc(Math.min(65536, MAX_INPUT_BYTES + 1 - total));
    const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
    if (!count) break;
    total += count;
    chunks.push(buffer.subarray(0, count));
  }
  if (total > MAX_INPUT_BYTES) throw new Error('Evidence exceeds input budget');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

if (require.main === module) {
  const [outputPath] = process.argv.slice(2);
  let input;
  try {
    input = readBoundedEvidence(0);
  } catch {
    input = {};
  }
  const evidence = normalizeEvidence(input);
  const delimiter = `DEPENDENCY_REVIEW_${crypto.randomUUID()}`;
  fs.appendFileSync(outputPath, `report<<${delimiter}\n${formatVulnerabilityReport(evidence)}\n${delimiter}\n`);
  if (!evidence.passed) process.exitCode = 1;
}

module.exports = { normalizeEvidence, formatVulnerabilityReport, MAX_REPORT_BYTES };
