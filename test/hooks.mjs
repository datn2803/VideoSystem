// ESM resolve hook cho test offline (Node ≥23): map "@/x" → src/x và thêm đuôi
// .ts/.tsx/.mts hoặc /index.ts cho import extensionless (Next bundler tự làm khi
// build app; node thẳng thì KHÔNG → hook này lấp). Bare module (node:.., npm) đi default.
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname } from "node:path";

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = pathResolve(ROOT, "src");

function firstFile(basePath) {
  const cands = [basePath, basePath + ".ts", basePath + ".tsx", basePath + ".mts", pathResolve(basePath, "index.ts")];
  for (const c of cands) {
    try { if (statSync(c).isFile()) return c; } catch { /* không tồn tại → thử tiếp */ }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let basePath = null;
  if (specifier.startsWith("@/")) {
    basePath = pathResolve(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".") && context.parentURL) {
    basePath = fileURLToPath(new URL(specifier, context.parentURL));
  }
  if (basePath) {
    const file = firstFile(basePath);
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}
