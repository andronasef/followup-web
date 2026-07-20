// TranslationProvider config seam (per .claude/CLAUDE.md's Stack Patterns
// section: "Keep the OpenAI SDK client behind a TranslationProvider
// interface with a per-language provider map in config" — built in Phase 1
// regardless of the FOUND-01 spike outcome, ~30 lines, so a second/default
// provider swap is a config change, not a refactor).
//
// D-04 (01-CONTEXT.md): the model ID must come from config, never a string
// literal inside scripts/translation-spike.mjs — protects against
// catalog-vs-live `GET /v1/models` drift (RESEARCH.md Pitfall 7).
//
// PROVIDER SUBSTITUTION (Plan 01-02, spike-time and until further notice):
// CLAUDE.md/STACK.md pin OVHcloud AI Endpoints as the default translation
// provider. No OVH key was available when this plan ran; the owner directed
// a substitution to NVIDIA NIM (OpenAI-compatible, same request shape) for
// the FOUND-01 spike, using `qwen/qwen3.5-397b-a17b` — confirmed live
// against NVIDIA's `GET /v1/models` and smoke-tested with a real chat
// completion on 2026-07-20 (see 01-02-SUMMARY.md "Decisions"). This is the
// same Qwen3.5-397B-A17B model family D-04 already locked as the
// best-multilingual candidate — only the hosting provider changed. OVH
// remains the documented default in CLAUDE.md/STACK.md; flip
// TRANSLATION_PROVIDER back to "ovh" once an OVH key exists.

export type TranslationProviderName = "ovh" | "nvidia";

export interface TranslationProviderConfig {
  name: TranslationProviderName;
  baseURL: string;
  apiKeyEnvVar: string;
  modelId: string;
}

const PROVIDERS: Record<TranslationProviderName, TranslationProviderConfig> = {
  ovh: {
    name: "ovh",
    baseURL: process.env.OVH_BASE_URL ?? "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    apiKeyEnvVar: "OVH_API_KEY",
    // Documented fallback only — reconfirm against GET /v1/models at run
    // time (Pitfall 7). D-04: Qwen3.5-397B-A17B is the only OVH model this
    // phase's spike design targets; never hardcoded as a literal in the
    // spike script itself.
    modelId: process.env.OVH_MODEL_ID ?? "Qwen3.5-397B-A17B",
  },
  nvidia: {
    name: "nvidia",
    baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    apiKeyEnvVar: "NVIDIA_API_KEY",
    // Confirmed live against NVIDIA's GET /v1/models and smoke-tested with a
    // real chat completion on 2026-07-20 — reconfirm at run time if this
    // ever drifts (same catalog-drift risk Pitfall 7 flags for OVH).
    modelId: process.env.NVIDIA_MODEL_ID ?? "qwen/qwen3.5-397b-a17b",
  },
};

const requested = process.env.TRANSLATION_PROVIDER as TranslationProviderName | undefined;
const ACTIVE_PROVIDER: TranslationProviderName =
  requested && requested in PROVIDERS ? requested : "nvidia";

export const activeProvider: TranslationProviderConfig = PROVIDERS[ACTIVE_PROVIDER];

// Back-compat named exports consumed directly by scripts/translation-spike.mjs
// (loaded via `node --experimental-strip-types`, no bundler) — never a
// string literal inside the spike script itself.
export const MODEL_ID = activeProvider.modelId;
export const BASE_URL = activeProvider.baseURL;
export const API_KEY_ENV_VAR = activeProvider.apiKeyEnvVar;
