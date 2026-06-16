// Đăng ký resolve hook (hooks.mjs) cho tiến trình test.
// Dùng: node --import ./test/alias.mjs test/<file>.test.mts
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
