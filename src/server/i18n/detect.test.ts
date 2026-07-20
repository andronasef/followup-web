import assert from "node:assert/strict";
import { test } from "node:test";
import { SUPPORTED_LANGUAGES, detectLanguage } from "./detect.ts";

test("detect: returns 'ar' when Accept-Language prefers a supported Arabic tag", () => {
  assert.equal(detectLanguage("ar-SA,ar;q=0.9", SUPPORTED_LANGUAGES), "ar");
});

test("detect: falls back to 'en' for an unsupported locale, no family-mapping guess", () => {
  assert.equal(detectLanguage("de-DE,de;q=0.9", SUPPORTED_LANGUAGES), "en");
});

test("detect: falls back to 'en' when no Accept-Language header is present", () => {
  assert.equal(detectLanguage(undefined, SUPPORTED_LANGUAGES), "en");
});

test("detect: picks the highest-quality supported tag when multiple are offered", () => {
  assert.equal(
    detectLanguage("fr;q=0.5,es;q=0.9,de;q=0.8", SUPPORTED_LANGUAGES),
    "es",
  );
});

test("detect: matches on base subtag even when a region subtag is present", () => {
  assert.equal(detectLanguage("zh-CN,zh;q=0.9", SUPPORTED_LANGUAGES), "zh");
});
