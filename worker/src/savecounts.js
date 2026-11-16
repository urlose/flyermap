// The planner estimates can contain fractions; database mailbox fields are integer.
// Largest remainder preserves the rounded order total across all saved routes.
export function savedMailboxCounts(routes = []) {
  const estimates = routes.map(r => {
    const n = Number(r.mailboxes);
    if (!Number.isFinite(n) || n < 0) throw new Error('Invalid mailbox estimate');
    return n;
  });
  const counts = estimates.map(Math.floor);
  const target = Math.round(estimates.reduce((s, n) => s + n, 0));
  const left = target - counts.reduce((s, n) => s + n, 0);
  const order = estimates.map((n, i) => ({ i, fraction:n - counts[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < left; i++) counts[order[i].i]++;
  return { routes:counts, total:target };
}
