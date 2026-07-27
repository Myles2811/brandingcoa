function parseFixed(value: string, scale: number): bigint {
  const raw = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error(`Invalid decimal: ${value}`);
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const padded = `${fraction}${'0'.repeat(scale)}`.slice(0, scale);
  const result = BigInt(whole) * BigInt(10) ** BigInt(scale) + BigInt(padded || '0');
  return negative ? -result : result;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < BigInt(0) ? BigInt(-1) : BigInt(1);
  const absolute = numerator < BigInt(0) ? -numerator : numerator;
  return sign * ((absolute + denominator / BigInt(2)) / denominator);
}

export function moneyToPence(value: string): bigint {
  return parseFixed(value, 2);
}

export function formatPence(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
}

export function sumMoney(values: Array<string | null | undefined>): string {
  return formatPence(values.reduce<bigint>((sum, value) => value == null ? sum : sum + moneyToPence(value), BigInt(0)));
}

export function calculateRebate(spend: string, rate: string): string {
  const spendPence = moneyToPence(spend);
  const scaledRate = parseFixed(rate, 8);
  return formatPence(divideRounded(spendPence * scaledRate, BigInt(100_000_000)));
}

export function moneyVariance(expected: string, reported: string): { amount: string; percent: string | null } {
  const expectedPence = moneyToPence(expected);
  const reportedPence = moneyToPence(reported);
  const variance = expectedPence - reportedPence;
  const percent = expectedPence === BigInt(0)
    ? null
    : (Number(variance) / Number(expectedPence) * 100).toFixed(2);
  return { amount: formatPence(variance), percent };
}

export function differsByMoreThan(expected: string, reported: string, tolerancePence = BigInt(1)): boolean {
  const difference = moneyToPence(expected) - moneyToPence(reported);
  return (difference < BigInt(0) ? -difference : difference) > tolerancePence;
}
