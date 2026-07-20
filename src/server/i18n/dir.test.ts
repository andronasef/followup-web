import assert from "node:assert/strict";
import { test } from "node:test";
import { SUPPORTED_LANGUAGES } from "./detect.ts";
import { dirFor } from "./dir.ts";

test("dir: Arabic is rtl", () => {
  assert.equal(dirFor("ar"), "rtl");
});

test("dir: every other supported language is ltr", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === "ar") continue;
    assert.equal(dirFor(lang), "ltr", `expected ${lang} to be ltr`);
  }
});

test("dir: exactly one supported language is rtl", () => {
  const rtlLanguages = SUPPORTED_LANGUAGES.filter((lang) => dirFor(lang) === "rtl");
  assert.deepEqual(rtlLanguages, ["ar"]);
});
