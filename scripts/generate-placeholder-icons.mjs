#!/usr/bin/env node
// PWA icon placeholders (T-02-24 -- no injection surface, zero external
// input). manifest.webmanifest has referenced /icon-192.png and
// /icon-512.png since Phase 1, but neither file existed, which silently
// blocks installability (02-RESEARCH.md Pitfall 6). This script hand-rolls
// a minimal, valid single-color PNG at both sizes using only node:zlib and
// node:fs -- no new dependency (`sharp`/`canvas`/etc. would be a large
// addition for two solid squares).
//
// Run once: `node scripts/generate-placeholder-icons.mjs`. The two output
// files are committed as static `public/` assets -- swapping them later for
// real branded artwork needs no rebuild-blocking change (they are NOT
// NEXT_PUBLIC_* build-time-inlined values, just static files Docker's
// standalone copy step already includes).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// One CRC32 table, computed once, per the PNG spec's Appendix.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/** A minimal valid PNG: one IHDR, one IDAT (a solid RGB color, no alpha), one IEND. */
function solidColorPng(size, [r, g, b]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type: 2 = truecolor (RGB)
  ihdrData.writeUInt8(0, 10); // compression method
  ihdrData.writeUInt8(0, 11); // filter method
  ihdrData.writeUInt8(0, 12); // interlace method
  const ihdr = chunk("IHDR", ihdrData);

  // Each scanline: a leading filter-type byte (0 = none) + width*3 RGB bytes.
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array(size).fill(row));
  const idat = chunk("IDAT", deflateSync(raw));

  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// A calm, neutral placeholder color -- close to the shipped `--primary`
// dark-mode token's grayscale family, deliberately not brand-specific
// since real branded assets are pending from the owner (see header
// comment above).
const PLACEHOLDER_COLOR = [38, 38, 38];

for (const size of [192, 512]) {
  const png = solidColorPng(size, PLACEHOLDER_COLOR);
  const outPath = join(PUBLIC_DIR, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`[generate-placeholder-icons] wrote ${outPath} (${png.length} bytes)`);
}
