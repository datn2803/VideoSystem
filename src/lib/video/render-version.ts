/**
 * Version pipeline render (P1.3 review đợt 2) — thành phần của renderHash C2/C3.
 *
 * BUMP TAY hằng số này mỗi khi đổi thứ làm video ra KHÁC mà nội dung script
 * giữ nguyên: sửa composition (animation.html/broll.html), đổi lõi render
 * (RENDER_ENGINE), đổi fps/quality mặc định trên VPS… → cache cũ tự vô hiệu,
 * render ra bản mới mà KHÔNG cần bấm force.
 */
export const RENDER_PIPELINE_VERSION = "2026-06-11-p2-tokens";
