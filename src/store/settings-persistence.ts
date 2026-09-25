export async function applyPersistedUpdate<T>(
  previous: T,
  optimistic: T,
  persist: () => Promise<T>,
  commit: (value: T) => void,
): Promise<void> {
  commit(optimistic);
  try {
    commit(await persist());
  } catch (error) {
    commit(previous);
    throw error;
  }
}
