/** Browser inference cadence follows measured device speed; combat remains at 60 Hz. */
export function decisionTiming(source: 'laya' | 'baseline', measuredLatencyMs = 0) {
  if (source === 'baseline') return { cadenceTicks: 10, expiryMs: 250, expiryTicks: 18, watchdogMs: 1_000 };
  const latency = Number.isFinite(measuredLatencyMs) ? Math.max(0, measuredLatencyMs) : 0;
  const expiryMs = Math.min(30_000, Math.max(3_000, latency * 2));
  return {
    cadenceTicks: Math.ceil(Math.max(650, latency) * 60 / 1_000),
    expiryMs,
    expiryTicks: Math.ceil(expiryMs * 60 / 1_000),
    watchdogMs: 30_000,
  };
}
