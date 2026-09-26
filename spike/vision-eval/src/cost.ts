import { config } from './config.js';
import type { TokenUsage } from './openrouter.js';

export interface CostBreakdown {
  /** Inference cost at provider list rates. */
  usd: number;
  /** Inference cost plus the credit top-up fee amortized onto it. */
  usdWithFee: number;
  inr: number;
  measured: boolean;
}

export function computeCost(usage: TokenUsage): CostBreakdown {
  if (usage.promptTokens === null && usage.completionTokens === null) {
    return { usd: 0, usdWithFee: 0, inr: 0, measured: false };
  }

  const promptTokens = usage.promptTokens ?? 0;
  const cached = Math.min(usage.cachedPromptTokens ?? 0, promptTokens);
  const uncached = promptTokens - cached;
  const completionTokens = usage.completionTokens ?? 0;

  const usd =
    (uncached / 1_000_000) * config.usdPerMillionInput +
    (cached / 1_000_000) * config.usdPerMillionCachedInput +
    (completionTokens / 1_000_000) * config.usdPerMillionOutput;

  const usdWithFee = usd * (1 + config.creditFeePercent / 100);

  return {
    usd,
    usdWithFee,
    inr: usdWithFee * config.inrPerUsd,
    measured: true,
  };
}

export function formatInr(value: number): string {
  return `₹${value.toFixed(4)}`;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
