/**
 * Design library — cửa ngõ duy nhất cho Tầng 2 (bộ não thiết kế).
 *
 * Gồm 3 nguồn vendor (chi tiết + license: THIRD_PARTY.md):
 *  - catalog.ts    — 15 design system (fintech/editorial/minimal) từ open-design,
 *                    palette + font máy-đọc-được; DESIGN.md đầy đủ ở systems/<id>/.
 *  - directions.ts — 5 hướng thẩm mỹ (OKLch palette + posture) từ open-design.
 *  - critique.ts   — rubric tự chấm 5 chiều + blacklist AI-slop (method open-design).
 *
 * Design Director (Phase 2) đọc từ đây để chọn hệ + hướng → đẻ BrandKit tokens.
 */
export { DESIGN_SYSTEMS, type DesignSystemSummary } from "./catalog";
export {
  DESIGN_DIRECTIONS,
  renderDirectionSpecBlock,
  findDirectionByLabel,
  type DesignDirection,
} from "./directions";
export {
  CRITIQUE_DIMENSIONS,
  CRITIQUE_PASS_THRESHOLD,
  AI_SLOP_BLACKLIST,
  renderCritiquePrompt,
  renderSlopChecklist,
  critiquePasses,
  type CritiqueDimension,
  type CritiqueScore,
} from "./critique";
