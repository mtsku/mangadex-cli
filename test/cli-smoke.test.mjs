import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve(process.cwd(), "dist", "cli.js");

function run(args) {
  return execFileSync("node", [cli, ...args], { encoding: "utf8" });
}

test("prints root help", () => {
  const out = run(["--help"]);
  assert.match(out, /mangadexctl/i);
  assert.match(out, /search/i);
});

test("prints feed help", () => {
  const out = run(["feed", "updates", "--help"]);
  assert.match(out, /window/i);
});

test("prints recommend help", () => {
  const out = run(["recommend", "suggest", "--help"]);
  assert.match(out, /exclude-library/i);
});
