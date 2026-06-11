/**
 * BrandKit — hợp đồng token giữa Tầng 2 (Design Director) và Tầng 3 (render).
 *
 * Token đặt tên KHỚP 1:1 bộ CSS var mà composition đang dùng (--bg1/--bg2/
 * --accent/--accent2/--ink/--sub/--card/--glow/--card-border/--grid-dot/
 * --elev-1/--elev-2/--good/--bad/--warn) → composition chỉ việc đổ thẳng vào
 * :root. Đổi BrandKit = đổi look toàn bộ video, KHÔNG sửa code composition.
 *
 * Đa brand: keyed theo profileId (mỗi kênh/brand 1 kit). Lưu KV "brandkits".
 */
import { kvRead, kvWrite } from "@/lib/backend/kv-store";

export type StyleVariant = "classic" | "poster" | "editorial";

export type BrandTokens = {
  mode: "light" | "dark";
  bg1: string;
  bg2: string;
  accent: string;
  accent2: string;
  ink: string;
  sub: string;
  card: string;
  glow: string;
  cardBorder: string;
  gridDot: string;
  elev1: string;
  elev2: string;
  good: string;
  bad: string;
  warn: string;
  /** Skin bố cục (hook/point/cta) — composition đổi class theo đây. */
  styleVariant: StyleVariant;
  /** Font ghi nhận từ design system — composition hiện giữ Be Vietnam Pro
   *  (font file nằm trên VPS, không tải remote lúc render); dành cho tương lai. */
  fontDisplay?: string;
  fontBody?: string;
};

export type BrandKit = {
  profileId: string;
  /** id design system trong src/design/library/catalog.ts */
  systemId: string;
  /** id hướng thẩm mỹ (directions.ts) nếu có */
  directionId?: string;
  tokens: BrandTokens;
  /** 1-2 câu vì sao chọn (hiển thị cho Tommy) */
  rationale: string;
  /** Tommy đã sửa tay → Director KHÔNG tự ghi đè nữa */
  overridden?: boolean;
  generatedAt: string;
};

const KEY = "brandkits";

type KitMap = Record<string, BrandKit>;

export const brandKitStore = {
  async get(profileId: string): Promise<BrandKit | undefined> {
    const map = await kvRead<KitMap>(KEY, {});
    return map[profileId];
  },
  async set(kit: BrandKit): Promise<void> {
    const map = await kvRead<KitMap>(KEY, {});
    map[kit.profileId] = kit;
    await kvWrite(KEY, map);
  },
  async list(): Promise<BrandKit[]> {
    return Object.values(await kvRead<KitMap>(KEY, {}));
  },
  async delete(profileId: string): Promise<void> {
    const map = await kvRead<KitMap>(KEY, {});
    delete map[profileId];
    await kvWrite(KEY, map);
  },
};
