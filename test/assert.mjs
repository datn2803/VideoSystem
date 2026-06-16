// Tiny assert harness — KHÔNG cần test framework (giữ deps tối thiểu).
// Chạy bằng node thẳng (Node ≥23 strip types .ts). Lỗi → exit 1.
let pass = 0;
let fail = 0;
const fails = [];

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  // JSON.stringify trả về undefined (KHÔNG phải chuỗi) cho undefined/function/symbol → a===e
  // dễ PASS GIẢ. Khi 1 vế serialize ra undefined: chỉ PASS nếu CẢ HAI là undefined nguyên thuỷ.
  const ok = a === undefined || e === undefined ? actual === undefined && expected === undefined : a === e;
  if (ok) { pass++; }
  else { fail++; fails.push(`${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}

export function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; fails.push(msg); }
}

export function done(suite) {
  const total = pass + fail;
  if (fail === 0) {
    process.stdout.write(`✅ ${suite}: ${pass}/${total} PASS\n`);
  } else {
    process.stdout.write(`❌ ${suite}: ${fail}/${total} FAIL\n`);
    for (const f of fails) process.stdout.write(`  • ${f}\n`);
    process.exit(1);
  }
}
