"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseMetadata } = require("../scripts/parse-dependabot-metadata");

test("rejects a commit message with no dependency metadata", () => {
  assert.throws(() => parseMetadata("No metadata"), /metadata is missing/);
});
