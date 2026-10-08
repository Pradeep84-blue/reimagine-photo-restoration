import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundled colorization sample", () => {
  it("includes portable before and model-colorized JPEGs under 1 MB each", () => {
    const files = ["demo-before.jpg", "demo-after.jpg"];
    const imageDirectory = resolve(process.cwd(), "client/public/images");

    for (const file of files) {
      const path = resolve(imageDirectory, file);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(statSync(path).size).toBeLessThan(1024 * 1024);
    }
  });
});
