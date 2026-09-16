/**
 * A minimal, dependency-free event bus used to notify interested parts of
 * the app (e.g. the notification center) when the derived financial
 * intelligence changes, without wiring every consumer directly into
 * `FinanceContext`.
 *
 * This intentionally stays simple — no external pub/sub library, no
 * WebSocket transport. When SpendWise gets a real backend/socket layer in a
 * later stage, this module is the seam to replace.
 */

export interface IntelligenceUpdatedPayload {
  insightCount: number;
  anomalyCount: number;
  criticalBudgetRisks: number;
  healthScore: number;
}

export type IntelligenceEvent =
  | { type: "transactions:changed" }
  | { type: "budgets:changed" }
  | { type: "goals:changed" }
  | { type: "intelligence:updated"; payload: IntelligenceUpdatedPayload };

type Listener = (event: IntelligenceEvent) => void;

class IntelligenceEventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: IntelligenceEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /** Number of active subscribers. Mainly useful for tests. */
  get size(): number {
    return this.listeners.size;
  }
}

export const intelligenceEvents = new IntelligenceEventBus();
