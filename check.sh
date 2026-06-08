#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check.sh — Xác minh dự án KHÔNG cần secret, KHÔNG cần Claude connector.
# Trả lời 4 câu:
#   1) Đang trỏ ĐÚNG Supabase/Vercel của dự án này không (chống lộn project)?
#   2) Supabase còn sống?
#   3) App (Vercel) còn sống, deploy nào đang phục vụ?
#   4) 3 deploy gần nhất trên GitHub là gì?
# Chạy:  bash check.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
GRN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; DIM=$'\033[2m'; BLD=$'\033[1m'; RST=$'\033[0m'

# ── Danh tính KỲ VỌNG (đây là giá trị PUBLIC — đã nằm sẵn trong bundle trình duyệt, KHÔNG phải secret) ──
EXPECT_SUPABASE="https://wkxdgsdfhnxtaryorluv.supabase.co"
EXPECT_APP="https://video-system-five.vercel.app"

# ── Đọc giá trị THẬT từ .env.local nếu có (chỉ lấy biến NEXT_PUBLIC_*/PUBLIC_* — không đụng tới secret) ──
read_env() { [ -f .env.local ] && grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d "\"' " ; }
SUPABASE_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"; SUPABASE_URL="${SUPABASE_URL:-$EXPECT_SUPABASE}"
APP_URL="$(read_env PUBLIC_APP_URL)"; APP_URL="${APP_URL:-$EXPECT_APP}"

echo "${BLD}═══ KIỂM TRA DỰ ÁN (không secret, không connector) ═══${RST}"
echo "${DIM}repo: $(git config --get remote.origin.url 2>/dev/null || echo '?')${RST}"
echo

# ── 1) Chống lộn project ──
echo "${BLD}▎1) Danh tính project${RST}"
if [ "$SUPABASE_URL" = "$EXPECT_SUPABASE" ]; then
  echo "  ${GRN}✓${RST} Supabase = $SUPABASE_URL ${DIM}(khớp kỳ vọng)${RST}"
else
  echo "  ${RED}⚠ CẢNH BÁO LỘN PROJECT:${RST} .env.local trỏ ${RED}$SUPABASE_URL${RST}"
  echo "    ${RED}≠ kỳ vọng${RST} $EXPECT_SUPABASE  ${DIM}(sửa .env.local hoặc EXPECT_SUPABASE trong check.sh)${RST}"
fi

# ── 2) Supabase sống? (health endpoint công khai, không cần key) ──
echo "${BLD}▎2) Supabase sống?${RST}"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$SUPABASE_URL/auth/v1/health" 2>/dev/null)
case "$code" in
  200|401) echo "  ${GRN}✓${RST} HTTP $code → project tồn tại & đang chạy";;
  000|"")  echo "  ${RED}✗${RST} không kết nối được (mạng / URL sai?)";;
  *)       echo "  ${YEL}?${RST} HTTP $code (bất thường)";;
esac

# ── 3) App/Vercel sống + deploy đang phục vụ ──
echo "${BLD}▎3) App (Vercel) sống?${RST}"
hdr=$(curl -sI --max-time 12 "$APP_URL" 2>/dev/null)
status=$(printf '%s' "$hdr" | head -1 | tr -d '\r')
vid=$(printf '%s' "$hdr" | grep -i '^x-vercel-id:' | head -1 | tr -d '\r')
srv=$(printf '%s' "$hdr" | grep -i '^server:' | head -1 | tr -d '\r')
if printf '%s' "$hdr" | grep -qi 'vercel'; then
  echo "  ${GRN}✓${RST} $status   ${DIM}${srv} | ${vid}${RST}"
else
  echo "  ${YEL}?${RST} ${status:-không phản hồi} ${DIM}(không thấy header Vercel)${RST}"
fi

# ── 4) Deploy gần nhất (gh CLI — KHÔNG cần secret riêng) ──
echo "${BLD}▎4) 3 deploy gần nhất (GitHub)${RST}"
if command -v gh >/dev/null 2>&1; then
  slug=$(git config --get remote.origin.url 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s/\.git$//')
  if [ -n "$slug" ]; then
    out=$(gh api "repos/$slug/deployments?per_page=3" --jq '.[] | "  • \(.sha[0:7])  \(.environment)  \(.created_at)"' 2>/dev/null)
    [ -n "$out" ] && printf '%s\n' "$out" || echo "  ${DIM}(không lấy được — gh chưa login? repo private? thử: gh auth login)${RST}"
  fi
else
  echo "  ${DIM}(chưa cài gh CLI — bỏ qua. Cài: brew install gh)${RST}"
fi
echo
echo "${DIM}Hoàn tất. Mọi kiểm tra trên KHÔNG dùng secret nào.${RST}"
