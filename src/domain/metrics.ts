export function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export type FunnelVolume = { stageId: string; position: number; count: number };

export function funnelConversion(volumes: FunnelVolume[]) {
  const ordered = [...volumes].sort((a, b) => a.position - b.position);
  return ordered.map((current, index) => {
    const previous = ordered[index - 1];
    return {
      ...current,
      conversionFromPrevious: previous ? safeRate(current.count, previous.count) : 100,
    };
  });
}
