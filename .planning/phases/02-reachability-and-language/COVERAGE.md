# Phase 2 — API Coverage Decision Checkpoint

Full coverage by default — every capability starts `INTEGRATE`; only a disciplined subtraction
with a stated reason moves a row to `OPT-OUT`. Two external integrations are in scope this phase.

## web-push (VAPID push send/receive) — `web-push@3.6.7` + `@types/web-push@3.6.4`

| capability | decision | reason |
|---|---|---|
| `setVapidDetails` (subject/public/private key config) | INTEGRATE | Core config seam (`src/server/push/vapid.ts`), module-scope, once. |
| `sendNotification` (core send + AES-GCM payload encryption) | INTEGRATE | The entire push-delivery path (PUSH-06). |
| `TTL` option | INTEGRATE | 24h per D-13 ("reach them later" window, not the 4-week default). |
| `urgency` option | INTEGRATE | `high` — wakes a doze-mode device for a chat reply. |
| `topic` option (coalescing) | INTEGRATE | D-13: multiple unread replies while locked collapse into one notification. |
| Default `contentEncoding` (aes128gcm) | INTEGRATE | Library default; no override needed. |
| 404/410 error contract (`err.statusCode`) | INTEGRATE | PUSH-10: delete the subscription row on receipt. |
| VAPID key generation (`generateVAPIDKeys`) | OPT-OUT | D-01: the owner generates the keypair themselves, off-box, via the CLI — never called from app code. |
| Legacy GCM API key / pre-VAPID auth | OPT-OUT | All target browsers support the VAPID standard; no legacy-GCM visitor base exists (anonymous, browser-only product). |
| Custom/override HTTP headers (non-VAPID auth) | OPT-OUT | Only VAPID bearer auth is used; no alternate auth scheme needed. |
| Outbound proxy / agent options | OPT-OUT | Single self-hosted Docker container with direct internet egress (Dokploy) — no proxy hop exists. |
| Custom VAPID JWT expiration (`exp` override) | OPT-OUT | Library default (12h) is fine; no requirement drives a custom value. |

## NVIDIA NIM translation (OpenAI-compatible, via `openai@6.48.0`)

| capability | decision | reason |
|---|---|---|
| Chat completions (core translate call) | INTEGRATE | The entire translation path (TRANS-01/02). |
| `response_format: json_object` (JSON mode) | INTEGRATE | Structured `{"translation":"..."}` output, with the spike's proven plain-text fallback when unsupported. |
| `temperature: 0` | INTEGRATE | Deterministic translation, matches the spike's proven config. |
| `maxRetries` (SDK-level retry/backoff) | INTEGRATE | TRANS-10: 429/backoff handling — set explicitly, not left at SDK default. |
| Request `timeout` | INTEGRATE | TRANS-09: translation must never hang indefinitely; bounded per call. |
| Streaming completions | OPT-OUT | TRANS-07 requires validating the COMPLETE output (script/length/refusal/token checks) before it's ever shown — a partial token stream can't be validated mid-flight, and no UX need exists for token-by-token translation display. |
| Function calling / tool use | OPT-OUT | Translation is a pure text-in/text-out task; no tool-calling need. |
| Embeddings API | OPT-OUT | No semantic search/similarity use case exists in this phase. |
| Vision / multimodal input | OPT-OUT | Translation input is always plain chat-message text, never an image. |
| `GET /v1/models` (live catalog check) | OPT-OUT | Research-time-only concern (catalog-vs-config drift, already resolved in `01-02-SUMMARY.md`); the model ID is pinned via `src/server/config/models.ts` config at runtime, never queried live by the app. |
| Fine-tuning API | OPT-OUT | Using a pretrained multilingual model directly; no fine-tuning need. |

**Both integrations audited against RESEARCH.md's Package Legitimacy Audit (`web-push`, `@types/web-push` — verdict OK, approved) and the existing, already-live NVIDIA NIM key/config from Phase 1 (`01-02-SUMMARY.md`).**
