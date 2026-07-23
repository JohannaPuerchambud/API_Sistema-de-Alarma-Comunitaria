import test from "node:test";
import assert from "node:assert/strict";
import { detectImageMimeType } from "../src/middlewares/upload.middleware.js";

test("detecta JPEG aunque el cliente no declare su MIME", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(detectImageMimeType(jpeg), "image/jpeg");
});

test("detecta PNG, GIF y WebP por su firma binaria", () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const gif = Buffer.from("GIF89a", "ascii");
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
  ]);

  assert.equal(detectImageMimeType(png), "image/png");
  assert.equal(detectImageMimeType(gif), "image/gif");
  assert.equal(detectImageMimeType(webp), "image/webp");
});

test("rechaza archivos que no contienen una imagen compatible", () => {
  assert.equal(detectImageMimeType(Buffer.from("archivo de texto")), null);
  assert.equal(detectImageMimeType(Buffer.alloc(0)), null);
});
