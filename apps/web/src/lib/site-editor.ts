export function moveItem<T>(items: readonly T[], index: number, direction: "up" | "down"): T[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return [...items];
  }
  const next = [...items];
  const tmp = next[index]!;
  next[index] = next[targetIndex]!;
  next[targetIndex] = tmp;
  return next;
}
