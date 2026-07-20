// Password hashing for the single owner account. Argon2id only (see
// .claude/CLAUDE.md "What NOT to Use" for why the legacy alternative is
// rejected — OWASP scoping plus an Alpine multi-stage build break on its
// native module). Params below are the OWASP 2026 minimums.
import { hash, verify, type Algorithm } from "@node-rs/argon2";

// @node-rs/argon2 declares `Algorithm` as an ambient `const enum`
// (index.d.ts), which TypeScript's `isolatedModules` (required by Next.js)
// forbids accessing as a value (TS2748) — so it's imported as a type only,
// and its Argon2id member's documented numeric value (2) is asserted here.
const OPTS = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password);
}
