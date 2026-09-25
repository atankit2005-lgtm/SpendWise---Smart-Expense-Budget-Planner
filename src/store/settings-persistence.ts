export async function applyPersistedUpdate<T>(
  previous: T,
  persist: () => Promise<T>,
  commit: (value: T) => void,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  try {
    const confirmed = await persist();
    if (isCurrent()) commit(confirmed);
  } catch (error) {
    if (isCurrent()) commit(previous);
    throw error;
  }
}
