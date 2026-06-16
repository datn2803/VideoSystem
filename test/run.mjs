// Chạy mọi test offline (Phase 1). Dùng: npm test  (hoặc: node test/run.mjs)
// Mỗi *.test.mts là script độc lập (assert riêng, exit 1 nếu fail) → spawn rời để
// process.exit của test này không giết test kia.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const alias = resolve(dir, "alias.mjs");
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mts")).sort();

let fail = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", alias, join(dir, f)], { stdio: "inherit" });
  if (r.status !== 0) fail = 1;
}
process.exit(fail);
