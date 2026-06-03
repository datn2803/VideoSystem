/**
 * Làm sạch text TRƯỚC khi đưa vào TTS (ElevenLabs).
 * Chỉ tác động tới chuỗi gửi cho engine đọc — KHÔNG đổi text hiển thị/đã lưu.
 *
 * - Bỏ markdown (**, *, _, `, #) nhưng giữ nội dung bên trong.
 * - Đổi ký hiệu sang chữ tiếng Việt để đọc tự nhiên (%, /năm, /tháng).
 * - "13-14" -> "13 đến 14".
 * - Chuẩn hoá khoảng trắng + đảm bảo có dấu câu để TTS ngắt nhịp.
 */
export function sanitizeForTTS(input: string): string {
  if (!input) return "";
  let t = input;

  // 1) Bỏ markdown — giữ nội dung
  t = t.replace(/^[ \t]*#{1,6}[ \t]*/gm, ""); // heading "# ", "## " ở đầu dòng
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1"); // **đậm**
  t = t.replace(/__([^_]+)__/g, "$1"); // __đậm__
  t = t.replace(/\*([^*]+)\*/g, "$1"); // *nghiêng*
  t = t.replace(/_([^_]+)_/g, "$1"); // _nghiêng_
  t = t.replace(/`([^`]*)`/g, "$1"); // `code`
  t = t.replace(/[*_`#]/g, ""); // ký tự markdown còn sót

  // 2) Ký hiệu -> chữ tiếng Việt (xử lý "/năm","/tháng" trước, rồi "%")
  t = t.replace(/\s*\/\s*năm\b/gi, " mỗi năm");
  t = t.replace(/\s*\/\s*tháng\b/gi, " mỗi tháng");
  t = t.replace(/\s*%/g, " phần trăm");

  // 3) Khoảng số "13-14" / "13 – 14" -> "13 đến 14" (cả gạch ngang en/em dash)
  t = t.replace(/(\d)\s*[-–—]\s*(\d)/g, "$1 đến $2");

  // 4) Chuẩn hoá khoảng trắng + dấu câu để ngắt nhịp
  // - mỗi dòng thành 1 câu: trim, nếu chưa có dấu kết câu thì thêm "."
  const sentences = t
    .split(/\r?\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;,]$/.test(line) ? line : `${line}.`));
  t = sentences.join(" ");

  // gộp khoảng trắng thừa, bỏ space trước dấu câu, gộp dấu chấm lặp
  t = t
    .replace(/\s+/g, " ")
    .replace(/\s+([.!?…,:;])/g, "$1")
    .replace(/\.{2,}/g, "…")
    .trim();

  return t;
}
