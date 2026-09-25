export interface FinanceSnapshotRequestGuard {
  begin(): number;
  invalidate(): void;
  isCurrent(generation: number): boolean;
}

export function createFinanceSnapshotRequestGuard(): FinanceSnapshotRequestGuard {
  let currentGeneration = 0;

  return {
    begin() {
      currentGeneration += 1;
      return currentGeneration;
    },
    invalidate() {
      currentGeneration += 1;
    },
    isCurrent(generation) {
      return generation === currentGeneration;
    },
  };
}
