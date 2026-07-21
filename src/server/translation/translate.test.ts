import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasRefusalMarker,
  lengthRatioOk,
  openaiClient,
  preservesTokens,
  scriptBlockMatch,
  translate,
} from "./translate.ts";

// --- translate() -----------------------------------------------------------
// openaiClient.chat.completions.create is mocked per-test via t.mock.method
// (auto-restored when the test ends) -- no network dependency.

function chatResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

test("translate: a well-formed JSON response returns { ok: true, text }", async (t) => {
  t.mock.method(openaiClient.chat.completions, "create", async () =>
    chatResponse('{"translation": "Hola, ¿cómo estás?"}'),
  );
  const result = await translate("Hello, how are you?", "en", "es");
  assert.deepEqual(result, { ok: true, text: "Hola, ¿cómo estás?" });
});

test("translate: falls back to extracting a bare {...} JSON blob when response_format json mode isn't honored", async (t) => {
  t.mock.method(openaiClient.chat.completions, "create", async () =>
    chatResponse('Sure, here you go: {"translation": "Hola"} — hope that helps!'),
  );
  const result = await translate("Hi", "en", "es");
  assert.deepEqual(result, { ok: true, text: "Hola" });
});

test("translate: returns { ok: false, error } (never throws) when no parseable translation field exists", async (t) => {
  t.mock.method(openaiClient.chat.completions, "create", async () => chatResponse("I refuse to translate this."));
  const result = await translate("Hi", "en", "es");
  assert.equal(result.ok, false);
  assert.equal(typeof (result as { ok: false; error: string }).error, "string");
});

test("translate: returns { ok: false, error } (never throws) when the SDK call itself rejects", async (t) => {
  t.mock.method(openaiClient.chat.completions, "create", async () => {
    throw new Error("HTTP 500 Internal Server Error");
  });
  const result = await translate("Hi", "en", "es");
  assert.equal(result.ok, false);
  assert.match((result as { ok: false; error: string }).error, /500/);
});

test("translate: an empty-string model response is never accepted as a valid translation (no parseable field)", async (t) => {
  t.mock.method(openaiClient.chat.completions, "create", async () => chatResponse(""));
  const result = await translate("Hello, how are you today?", "en", "es");
  assert.equal(result.ok, false);
});

// --- scriptBlockMatch --------------------------------------------------------

test("scriptBlockMatch: matches Arabic script text against the ar target", () => {
  assert.equal(scriptBlockMatch("مرحبا بك", "ar"), true);
  assert.equal(scriptBlockMatch("Hello there", "ar"), false);
});

test("scriptBlockMatch: matches CJK script text against the zh target", () => {
  assert.equal(scriptBlockMatch("你好，世界", "zh"), true);
  assert.equal(scriptBlockMatch("Hello world", "zh"), false);
});

test("scriptBlockMatch: matches Devanagari script text against the hi target", () => {
  assert.equal(scriptBlockMatch("नमस्ते दुनिया", "hi"), true);
  assert.equal(scriptBlockMatch("Hello world", "hi"), false);
});

test("scriptBlockMatch: matches Cyrillic script text against the ru target", () => {
  assert.equal(scriptBlockMatch("Привет мир", "ru"), true);
  assert.equal(scriptBlockMatch("Hello world", "ru"), false);
});

test("scriptBlockMatch: matches Latin script text against the en/es/fr/pt/id/sw targets", () => {
  for (const lang of ["en", "es", "fr", "pt", "id", "sw"]) {
    assert.equal(scriptBlockMatch("Hello world", lang), true, `expected latin match for ${lang}`);
  }
});

test("scriptBlockMatch: multi-byte and astral-plane content is validated by code point, not miscounted as belonging to the wrong script", () => {
  // Astral-plane emoji (surrogate pairs in UTF-16) mixed alongside real
  // script text must not break matching or falsely satisfy it.
  assert.equal(scriptBlockMatch("你好😀🎉", "zh"), true);
  assert.equal(scriptBlockMatch("مرحبا😀🎉", "ar"), true);
  assert.equal(scriptBlockMatch("😀🎉", "zh"), false, "emoji alone must never satisfy a script range");
});

// --- lengthRatioOk -----------------------------------------------------------

test("lengthRatioOk: true when the output/input length ratio is within [0.4, 2.5]", () => {
  assert.equal(lengthRatioOk("Hello there", "Hola amigo"), true);
});

test("lengthRatioOk: false when the output is far too short relative to the input", () => {
  assert.equal(lengthRatioOk("Hello, how are you doing today my friend?", "Hi"), false);
});

test("lengthRatioOk: false when the output is far too long relative to the input", () => {
  assert.equal(lengthRatioOk("Hi", "Hello there, how are you doing on this fine day my friend?"), false);
});

test("lengthRatioOk: an empty-string output fails the ratio check -- never accepted as a valid translation", () => {
  assert.equal(lengthRatioOk("Hello, how are you today?", ""), false);
});

// --- hasRefusalMarker ---------------------------------------------------------

test("hasRefusalMarker: true for a refusal sentence", () => {
  assert.equal(hasRefusalMarker("I'm sorry, I cannot help with that."), true);
});

test("hasRefusalMarker: false for a normal translated sentence", () => {
  assert.equal(hasRefusalMarker("Hola, ¿cómo estás hoy?"), false);
});

// --- preservesTokens -----------------------------------------------------------

test("preservesTokens: true when URL/digit/emoji counts match exactly between input and output", () => {
  assert.equal(
    preservesTokens("Call me at 555-1234 or visit https://example.com 😀", "Llámame al 555-1234 o visita https://example.com 😀"),
    true,
  );
});

test("preservesTokens: false when a digit run is dropped in translation", () => {
  assert.equal(preservesTokens("I have 3 apples and 5 oranges", "Tengo manzanas y 5 naranjas"), false);
});

test("preservesTokens: false when a URL is dropped in translation", () => {
  assert.equal(preservesTokens("Visit https://example.com now", "Visita ahora"), false);
});

test("preservesTokens: false when an emoji is dropped in translation", () => {
  assert.equal(preservesTokens("Great news! 😀", "¡Buenas noticias!"), false);
});
