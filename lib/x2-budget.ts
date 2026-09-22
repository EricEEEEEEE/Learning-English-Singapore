// X2's local ledger is a second line of defence, not proof that a provider
// endpoint has an enforceable per-request ceiling or that charges are final.
const APPROVED_X2_USD = 25;
const MICRO_USD = 1_000_000;

type Kind = 'tts' | 'realtime';
type Attempt = {
  id: string;
  originalId: string;
  kind: Kind;
  maximumUsd: number | null;
  maximumEvidence: string | null;
};
type Result = { actualUsd: number };

function money(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and nonnegative`);
  const micros = Math.ceil(value * MICRO_USD);
  if (!Number.isSafeInteger(micros)) throw new Error(`${label} is too large`);
  return micros;
}

export class X2Budget {
  private readonly limit: number;
  private spent = 0;
  private reserved = 0;
  private halted = false;
  private readonly pending = new Map<string, number>();
  private readonly usedIds = new Set<string>();
  private readonly attemptCounts = new Map<string, number>();

  constructor(approvedUsd: number) {
    const cap = money(approvedUsd, 'approved budget');
    if (cap > APPROVED_X2_USD * MICRO_USD) throw new Error('X2 approval limit is USD 25');
    this.limit = cap;
  }

  get spentUsd(): number { return this.spent / MICRO_USD; }
  get reservedUsd(): number { return this.reserved / MICRO_USD; }

  reserve(attempt: Attempt): void {
    if (this.halted) throw new Error('X2 budget is halted pending charge reconciliation');
    if (!attempt.id || !attempt.originalId || !['tts', 'realtime'].includes(attempt.kind)) {
      throw new Error('Invalid X2 attempt');
    }
    if (attempt.maximumUsd == null || !attempt.maximumEvidence?.trim()) {
      throw new Error('Enforceable maximum exposure evidence is required');
    }
    const maximum = money(attempt.maximumUsd, 'maximum exposure');
    if (maximum === 0) throw new Error('Maximum exposure must be positive');
    if (this.usedIds.has(attempt.id)) throw new Error('Duplicate attempt ID');
    const count = this.attemptCounts.get(attempt.originalId) ?? 0;
    if (count >= 2) throw new Error('Only one retry is allowed for an X2 sample');
    if (this.spent + this.reserved + maximum > this.limit) throw new Error('X2 budget limit exceeded');
    this.pending.set(attempt.id, maximum);
    this.usedIds.add(attempt.id);
    this.attemptCounts.set(attempt.originalId, count + 1);
    this.reserved += maximum;
  }

  settle(id: string, actualUsd: number): void {
    const maximum = this.pending.get(id);
    if (maximum == null) throw new Error('Unknown pending X2 attempt');
    let actual: number;
    try {
      actual = money(actualUsd, 'actual charge');
    } catch (error) {
      this.halted = true;
      throw error;
    }
    if (actual > maximum) {
      this.halted = true;
      throw new Error('Actual charge exceeded reserved maximum; stop new requests');
    }
    this.spent += actual;
    this.reserved -= maximum;
    this.pending.delete(id);
  }
}

export function createX2Budget({ approvedUsd }: { approvedUsd: number }): X2Budget {
  return new X2Budget(approvedUsd);
}

export async function runX2Attempt<T extends Result>(
  budget: X2Budget,
  attempt: Attempt,
  request: () => Promise<T>,
): Promise<T> {
  budget.reserve(attempt);
  // Errors and missing/over-limit usage deliberately leave the full amount
  // pending until a separately evidenced final bill is reconciled.
  const result = await request();
  budget.settle(attempt.id, result.actualUsd);
  return result;
}
