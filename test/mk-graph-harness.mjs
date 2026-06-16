// Sinh harness headless cho graph mode: inject stub window.__hyperframes + script verify
// vào BẢN SAO animation.html (đặt trong compositions/ để ../vendor/gsap resolve).
// Dùng: node test/mk-graph-harness.mjs   → tạo compositions/_graph-harness.html
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMP = resolve(ROOT, "hyperframes-service/compositions/animation.html");
const GSAP = resolve(ROOT, "hyperframes-service/vendor/gsap.min.js");
// Xuất ra TMP (KHÔNG ghi vào compositions/ → tránh lỡ deploy/commit harness lên VPS).
const OUT = resolve(tmpdir(), "_graph-harness.html");

// 14 cảnh — đủ archetype (Phase 1.1: thêm donut/trend/before_after/mini/pills/principle).
const scenes = [
  { id: "hook", intent: "hook", vars: { hook_keyword: "Lãng phí", hook_line1: "Bạn đang mất hàng giờ", hook_line2: "mỗi ngày mà không hề biết" } },
  { id: "stat", intent: "bignum", vars: { bignum_value: "65", bignum_unit: "giờ", bignum_label: "MỖI THÁNG" } },
  { id: "donut", intent: "donut", vars: { donut: JSON.stringify({ value: "72", unit: "%", label: "tự động hoá được (ví dụ)" }) } },
  { id: "bars", intent: "bars", vars: { data_bars: JSON.stringify([{ label: "Thủ công", value: "40", unit: "giờ" }, { label: "Tự động", value: "8", unit: "giờ" }]), bars_title: "So sánh thời gian" } },
  { id: "trend", intent: "trend", vars: { trend: JSON.stringify({ label: "Tăng trưởng (ví dụ)", points: ["10", "22", "38", "60"] }) } },
  { id: "ba", intent: "before_after", vars: { before_after: JSON.stringify({ fromValue: "8", fromLabel: "Trước", toValue: "1", toLabel: "Sau", unit: "giờ" }) } },
  { id: "mini", intent: "mini", vars: { mini_stats: JSON.stringify([{ value: "3", unit: "x", label: "Tốc độ" }, { value: "5", unit: "x", label: "Hiệu suất" }, { value: "40", unit: "%", label: "Tiết kiệm" }, { value: "2", unit: "tuần", label: "Triển khai" }]), mini_title: "Chỉ số (ví dụ)" } },
  { id: "pills", intent: "pills", vars: { pills: JSON.stringify([{ n: "1", label: "Nhanh hơn" }, { n: "2", label: "Rẻ hơn" }, { n: "3", label: "Ít lỗi" }, { n: "4", label: "Dễ mở rộng" }]), pills_title: "Lợi ích" } },
  { id: "p1", intent: "points", vars: { points: JSON.stringify([{ n: 1, total: 1, title: "Xác định việc lặp lại mỗi tuần", detail: "Liệt kê các tác vụ làm đi làm lại để khoanh vùng tự động hoá", stat: { value: "3", unit: "giờ", label: "tiết kiệm mỗi tuần" } }]) } },
  { id: "flow", intent: "flow", vars: { flow: JSON.stringify({ title: "Quy trình", steps: ["Ghi lại tác vụ", "Tự động hoá", "Đo lường kết quả"] }) } },
  { id: "cmp", intent: "compare", vars: { compare: JSON.stringify({ leftTitle: "Thủ công", leftItems: ["Chậm", "Dễ sai sót"], rightTitle: "Tự động", rightItems: ["Nhanh gấp 5", "Chính xác"] }) } },
  { id: "principle", intent: "principle", vars: { principle: "Tự động hoá việc lặp, dành sức cho việc sáng tạo" } },
  { id: "quote", intent: "callout", vars: { callout: "Tự động hoá không thay thế bạn — nó giải phóng thời gian của bạn." } },
  { id: "cta", intent: "cta", vars: { cta_top: "Sẵn sàng bứt phá?", cta_keyword: "Theo dõi ngay", cta_hl: "ngay" } },
];
const total = 40;
const each = total / scenes.length;
const scene_times = {};
scenes.forEach((s, i) => { scene_times[s.id] = { start: +(i * each).toFixed(2), dur: +each.toFixed(2) }; });

const VARS = {
  graphDriven: "true",
  scenes: JSON.stringify(scenes),
  scene_times: JSON.stringify(scene_times),
  duration: String(total),
  theme: "0",
  topic: "Tự động hoá",
  captions: JSON.stringify([{ s: 0.3, e: 5, w: [{ t: 0.3, x: "Bạn" }, { t: 0.8, x: "đang" }, { t: 1.3, x: "lãng" }, { t: 1.8, x: "phí" }] }]),
  tokens: "",
  compact: "",
};

const stub = `
<script>
  window.__hyperframes = { getVariables: () => (${JSON.stringify(VARS)}) };
</script>`;

const verify = `
<div id="__result" style="display:none"></div>
<script>
  (function () {
    function run() {
      const out = { ok: true, errors: [], scenes: [], duration: ${total} };
      try {
        const tl = window.__timelines && window.__timelines.main;
        if (!tl) { out.ok = false; out.errors.push("KHÔNG có window.__timelines.main"); document.getElementById("__result").textContent = JSON.stringify(out); return; }
        const hosts = Array.prototype.slice.call(document.querySelectorAll('[id^="gs"]'));
        out.hostCount = hosts.length;
        // Slot tĩnh baked PHẢI bị bỏ (chỉ còn bgbase + gs*) — nếu sót → skeleton bleed (review HIGH).
        const baked = Array.prototype.slice.call(document.querySelectorAll(".scene.clip")).filter(function (el) { return el.id !== "bgbase" && el.id.indexOf("gs") !== 0; });
        out.bakedLeftover = baked.map(function (el) { return el.id; });
        if (baked.length) { out.ok = false; out.errors.push("SLOT BAKED CÒN SÓT (bleed): " + out.bakedLeftover.join(",")); }
        // thứ tự build = gs0..gsN; data-start phải tăng dần
        let prevStart = -1;
        hosts.forEach((h, i) => {
          const start = parseFloat(h.getAttribute("data-start"));
          const dur = parseFloat(h.getAttribute("data-duration"));
          const rec = { id: h.id, start: start, dur: dur, cls: h.className };
          if (start < prevStart - 0.001) { out.ok = false; out.errors.push(h.id + " start lùi (" + start + " < " + prevStart + ")"); }
          prevStart = start;
          out.scenes.push(rec);
        });
        // Tràn chữ: seek tới giữa từng cảnh, ép layout, soi các phần tử chữ lớn
        hosts.forEach((h) => {
          const start = parseFloat(h.getAttribute("data-start"));
          const dur = parseFloat(h.getAttribute("data-duration"));
          tl.time(start + dur / 2, false);
          const sels = [".key", ".l", ".bignum", ".pttitle", ".e2", ".e1", ".pn", ".fpt", ".cs", ".callout"];
          sels.forEach((sel) => {
            h.querySelectorAll(sel).forEach((el) => {
              if (el.scrollWidth > el.clientWidth + 2) { out.ok = false; out.errors.push("TRÀN NGANG " + h.id + " " + sel + " (" + el.scrollWidth + ">" + el.clientWidth + "): " + (el.textContent || "").slice(0, 30)); }
              if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0) { out.errors.push("(cảnh báo) tràn DỌC " + h.id + " " + sel + " (" + el.scrollHeight + ">" + el.clientHeight + ")"); }
            });
          });
        });
        // Seek theo URL ?t= để chụp 1 frame cụ thể
        const m = location.search.match(/[?&]t=([0-9.]+)/);
        if (m) tl.time(parseFloat(m[1]), false); else tl.time(0, false);
      } catch (e) { out.ok = false; out.errors.push("EXCEPTION: " + (e && e.message || e)); }
      document.getElementById("__result").textContent = JSON.stringify(out);
      window.__verifyResult = out;
    }
    function start() {
      // Chờ font sẵn sàng → re-fit của composition chạy xong rồi mới đo (khớp trạng thái render thật).
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(function () { setTimeout(run, 60); });
      else run();
    }
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start);
  })();
</script>`;

let html = readFileSync(COMP, "utf8");
// Inline gsap (thay <script src="../vendor/gsap.min.js">) → harness chạy được từ /tmp.
const gsap = readFileSync(GSAP, "utf8");
html = html.replace('<script src="../vendor/gsap.min.js"></script>', "<script>\n" + gsap + "\n</script>");
// Inject stub NGAY TRƯỚC <script> chính (script đầu tiên chứa getVariables).
const idx = html.indexOf("    <script>\n      const v = (window.__hyperframes");
if (idx < 0) { console.error("Không tìm thấy điểm chèn stub"); process.exit(1); }
html = html.slice(0, idx) + stub + "\n" + html.slice(idx);
// Inject verify trước </body>
html = html.replace("</body>", verify + "\n  </body>");
writeFileSync(OUT, html);
console.log("✅ Harness:", OUT);
