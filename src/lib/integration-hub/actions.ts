"use server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { store } from "./storage";
import { encryptSecret, decryptSecret, maskSecret } from "./vault";
import { getProviderMeta } from "./catalog";
import { hub } from "./hub";
import type { ProviderConfig, ProviderName } from "./types";

export async function addProviderAction(input: {
  name: ProviderName;
  apiKey: string;
  config?: Record<string, unknown>;
}) {
  const meta = getProviderMeta(input.name);
  if (!meta) throw new Error(`Unknown provider: ${input.name}`);
  const id = crypto.randomUUID();
  const others = (await store.listProviders()).filter((p) => p.kind === meta.kind);
  const isDefault = others.length === 0;
  const provider: ProviderConfig = {
    id,
    name: input.name,
    kind: meta.kind,
    label: meta.label,
    enabled: true,
    isDefault,
    config: { ...(meta.defaultConfig || {}), ...(input.config || {}) },
    createdAt: new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
  };
  await store.upsertProvider(provider);
  if (input.apiKey) await store.setCredential(id, encryptSecret(input.apiKey));
  revalidatePath("/settings/integrations");
  return { id, ok: true };
}

export async function updateProviderAction(input: {
  id: string;
  apiKey?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  isDefault?: boolean;
}) {
  const p = await store.getProvider(input.id);
  if (!p) throw new Error("Provider not found");
  if (input.config) p.config = { ...p.config, ...input.config };
  if (typeof input.enabled === "boolean") p.enabled = input.enabled;
  if (input.isDefault) {
    const others = (await store.listProviders()).filter((x) => x.kind === p.kind && x.id !== p.id);
    for (const other of others) {
      other.isDefault = false;
      await store.upsertProvider(other);
    }
    p.isDefault = true;
  }
  await store.upsertProvider(p);
  if (input.apiKey) {
    await store.setCredential(p.id, encryptSecret(input.apiKey));
    p.rotatedAt = new Date().toISOString();
    await store.upsertProvider(p);
  }
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function deleteProviderAction(id: string) {
  await store.deleteProvider(id);
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function testProviderAction(id: string) {
  const result = await hub.testConnection(id);
  await store.recordHealth({
    providerId: id,
    checkedAt: new Date().toISOString(),
    ok: result.ok,
    latencyMs: result.latencyMs,
    error: result.error,
  });
  revalidatePath("/settings/integrations");
  return result;
}

export async function setDefaultProviderAction(id: string) {
  return updateProviderAction({ id, isDefault: true });
}

export async function listProvidersWithStatus() {
  const providers = await store.listProviders();
  const result = [];
  for (const p of providers) {
    const enc = await store.getCredential(p.id);
    let masked = "";
    if (enc) {
      try {
        masked = maskSecret(decryptSecret(enc));
      } catch {
        masked = "•••• corrupted";
      }
    }
    const usage = await store.listUsage(p.id);
    const health = await store.latestHealth(p.id);
    const totalCost = usage.reduce((s, u) => s + u.costEstimateUsd, 0);
    const totalRequests = usage.reduce((s, u) => s + u.requestCount, 0);
    result.push({ ...p, maskedKey: masked, hasKey: !!enc, totalCost, totalRequests, lastHealth: health });
  }
  return result;
}
