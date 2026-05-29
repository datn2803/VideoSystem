import path from "node:path";

/**
 * On serverless platforms (Vercel/Lambda), only /tmp is writable.
 * On local dev/server, use .data/ in project root for persistence across restarts.
 *
 * IMPORTANT: /tmp on Vercel is ephemeral — data may be lost between invocations
 * or cold starts. For production, swap storage modules to Supabase.
 */
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export const DATA_ROOT = isServerless ? "/tmp/videosystem-data" : path.join(process.cwd(), ".data");

export function dataPath(...segments: string[]): string {
  return path.join(DATA_ROOT, ...segments);
}

export const IS_SERVERLESS = isServerless;
