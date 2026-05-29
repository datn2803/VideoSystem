import type { Platform } from "./storage";

/**
 * Localize caption per platform. Uses rule-based transforms (fast, deterministic).
 * Future enhancement: LLM-based optimization.
 */

const PLATFORM_HASHTAGS: Record<Platform, string[]> = {
  tiktok: ["#fyp", "#xuhuong", "#learnontiktok"],
  facebook: ["#reels", "#tiktokvn"],
  youtube_shorts: ["#Shorts", "#YouTubeShorts"],
};

const MAX_CHARS: Record<Platform, number> = {
  tiktok: 2200,
  facebook: 63206,
  youtube_shorts: 5000,
};

export function localizeCaption(input: {
  baseCaption: string;
  baseHashtags: string[];
  platform: Platform;
  topic: string;
}): { caption: string; hashtags: string[] } {
  const { baseCaption, baseHashtags, platform, topic } = input;

  // Merge platform-specific hashtags + base, dedupe
  const merged = Array.from(new Set([...baseHashtags, ...PLATFORM_HASHTAGS[platform]]));

  let caption = baseCaption;
  if (platform === "tiktok") {
    // TikTok: keep snappy, max 8 hashtags, emoji-heavy
    return {
      caption: caption.slice(0, MAX_CHARS.tiktok),
      hashtags: merged.slice(0, 8),
    };
  }
  if (platform === "facebook") {
    // Facebook: more conversational, fewer hashtags
    return {
      caption: caption.slice(0, MAX_CHARS.facebook),
      hashtags: merged.slice(0, 5),
    };
  }
  if (platform === "youtube_shorts") {
    // YouTube Shorts: structured, must include #Shorts
    const hasShorts = merged.some((h) => h.toLowerCase().includes("#shorts"));
    const finalTags = hasShorts ? merged : ["#Shorts", ...merged];
    return {
      caption: `${topic}\n\n${caption}`.slice(0, MAX_CHARS.youtube_shorts),
      hashtags: finalTags.slice(0, 15),
    };
  }
  return { caption, hashtags: merged };
}

export const PLATFORM_META: Record<Platform, { label: string; icon: string; color: string; aspectRatio: string }> = {
  tiktok: { label: "TikTok", icon: "🎵", color: "bg-pink-100 text-pink-700", aspectRatio: "9:16" },
  facebook: { label: "Facebook Reels", icon: "📘", color: "bg-blue-100 text-blue-700", aspectRatio: "9:16" },
  youtube_shorts: { label: "YouTube Shorts", icon: "▶️", color: "bg-rose-100 text-rose-700", aspectRatio: "9:16" },
};
