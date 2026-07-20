import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDigits } from "./format.ts";

test("format: renders plain ASCII digits for a number", () => {
  assert.equal(formatDigits(1234), "1234");
});

test("format: renders plain ASCII digits when a locale is passed", () => {
  assert.equal(formatDigits(1234, "ar"), "1234");
  assert.equal(formatDigits(1234, "hi"), "1234");
});

test("format: never emits Arabic-Indic or Devanagari digit characters", () => {
  const result = formatDigits(1234567890, "ar");
  assert.ok(/^[0-9]+$/.test(result), `expected ASCII-only digits, got: ${result}`);
});
