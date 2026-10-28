/**
 * Pure layout algorithms. Kept framework-free so they're easy to unit test.
 */

export interface TimedItem {
  id: string;
  start: number;
  end: number;
}

export interface TimedPlacement {
  /** Zero-based column within its overlap cluster. */
  column: number;
  /** Total columns in the cluster. */
  columns: number;
  /** How many columns this item can span to the right without colliding. */
  span: number;
}

/**
 * Classic "overlap columns" layout for a day column in a time grid.
 * Items are grouped into clusters of transitively-overlapping events; within a cluster
 * each item gets the first free column, then expands right into free columns.
 */
export function layoutTimedItems(items: readonly TimedItem[]): Map<string, TimedPlacement> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result = new Map<string, TimedPlacement>();

  let cluster: { item: TimedItem; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columns = columnEnds.length;
    for (const { item, column } of cluster) {
      let span = 1;
      for (let c = column + 1; c < columns; c++) {
        const blocked = cluster.some(
          (o) => o.column === c && o.item.start < Math.max(item.end, item.start + 1) && Math.max(o.item.end, o.item.start + 1) > item.start,
        );
        if (blocked) break;
        span++;
      }
      result.set(item.id, { column, columns, span });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    const end = Math.max(item.end, item.start + 1);
    if (item.start >= clusterEnd && cluster.length) flush();
    let column = columnEnds.findIndex((colEnd) => colEnd <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    cluster.push({ item, column });
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return result;
}

export interface SpanItem {
  id: string;
  /** Inclusive start column index. */
  startCol: number;
  /** Inclusive end column index. */
  endCol: number;
}

/**
 * Assign multi-day bars in a week row to stacked lanes (first-fit after sorting by
 * start column, longer spans first so they sit on top).
 */
export function layoutSpanLanes(items: readonly SpanItem[]): Map<string, number> {
  const sorted = [...items].sort(
    (a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol),
  );
  const laneEnds: number[] = [];
  const result = new Map<string, number>();
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endCol);
    } else {
      laneEnds[lane] = item.endCol;
    }
    result.set(item.id, lane);
  }
  return result;
}
