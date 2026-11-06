/**
 * Where the gaps between program blocks are. Pure arithmetic over row boxes,
 * so the caret placement and drop targets are tested without a DOM.
 *
 * Gap k sits before row k; gap n sits after the last of n rows. Gap numbers
 * are the IR's slot numbers.
 */
export interface RowBox {
  top: number;
  height: number;
}

/** Vertical centre of every gap, in the rows' coordinate space. */
export function gapCentres(rows: readonly RowBox[], gap = 0): number[] {
  if (rows.length === 0) return [0];
  const centres = rows.map((r) => r.top - gap / 2);
  const last = rows[rows.length - 1]!;
  centres.push(last.top + last.height + gap / 2);
  return centres;
}

/** The gap a pointer at y is closest to: the number of rows whose middle is above y. */
export function slotForY(rows: readonly RowBox[], y: number): number {
  let slot = 0;
  for (const r of rows) if (y > r.top + r.height / 2) slot++;
  return slot;
}
