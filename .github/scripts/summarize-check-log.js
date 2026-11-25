"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");

function splitLines(text) {
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function summarize(lines) {
  const limit = 16_000;
  const indexes = new Set();
  function include(start, end) {
    for (let i = Math.max(0, start); i < Math.min(lines.length, end); i++) indexes.add(i);
  }
  include(0, 20);
  include(lines.length - 20, lines.length);

  let failures = [];
  for (const [i, line] of lines.entries()) {
    if (/not ok|FAIL(?:ED|URE)?|Traceback|AssertionError|^\s*[×✖]|Error:/u.test(line)) failures.push(i);
  }
  if (failures.length > 12) {
    failures = Array.from({ length: 12 }, (_, i) => failures[Math.round(i * (failures.length - 1) / 11)]);
  }
  for (const i of failures) include(i - 1, i + 4);

  // Reserve space for later failures even if an early line is enormous.
  const perLine = Math.max(32, Math.floor((limit - 1000) / Math.max(1, indexes.size)));
  const selected = [];
  let previous = -1;
  for (const i of [...indexes].sort((a, b) => a - b)) {
    if (i > previous + 1) selected.push("... omitted lines; complete output is in the job log ...");
    selected.push(lines[i].slice(0, perLine));
    previous = i;
  }
  return selected.join("\n").slice(0, limit);
}

function saveArtifact(source, text) {
  const { dir, name } = path.parse(source);
  const cap = 512 * 1024;
  let data = Buffer.from(text, "utf8");
  if (data.length > 2 * cap) {
    const marker = Buffer.from("\n... artifact truncated; complete output is in the job log ...\n");
    data = Buffer.concat([data.subarray(0, cap), marker, data.subarray(-cap)]);
  }
  fs.writeFileSync(path.join(dir, `${name}.bounded.txt`), data);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string", default: "log" },
    status: { type: "string" },
    "exit-code": { type: "string" },
    "summary-lines": { type: "string" },
    "tail-lines": { type: "string" },
  },
});
if (positionals.length !== 1) throw new Error("Expected a source log path");
if (values.status !== undefined && !["success", "failure"].includes(values.status)) {
  throw new Error("--status must be success or failure");
}
if (values.status !== undefined && values["exit-code"] !== undefined) {
  throw new Error("Use only one of --status or --exit-code");
}
if (values["summary-lines"] !== undefined && values["tail-lines"] !== undefined) {
  throw new Error("Use only one of --summary-lines or --tail-lines");
}
for (const key of ["summary-lines", "tail-lines"]) {
  if (values[key] !== undefined && !/^[+-]?\d+$/.test(values[key])) throw new Error(`--${key} requires an integer`);
}
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(values.name)) throw new Error("Invalid GitHub output name");

const [source] = positionals;
const tailLines = Number(values["tail-lines"]);
const summaryLines = Number(values["summary-lines"]);
const missing = tailLines ? "No lint output captured." : "No check output was produced.";
const text = fs.existsSync(source) ? fs.readFileSync(source, "utf8").replace(/\r\n?/g, "\n") : missing;
const lines = splitLines(text);
let content;
if (tailLines) {
  content = lines.slice(-tailLines).join("\n");
} else {
  content = summarize(lines);
  if (summaryLines) content = splitLines(content).slice(-summaryLines).join("\n");
  saveArtifact(source, text);
}

const output = [];
if (values["exit-code"] !== undefined) output.push(`status=${values["exit-code"] === "0" ? "success" : "failure"}`);
if (values.status !== undefined) output.push(`${values.name}_status=${values.status}`);
const delimiter = `LOG_${randomUUID().replaceAll("-", "")}`;
output.push(`${values.name}<<${delimiter}`, content, delimiter, "");
fs.appendFileSync(process.env.GITHUB_OUTPUT, output.join("\n"));
