import { randomUUID } from "node:crypto";
import type {
  CommunityDiscoveryDb,
  CommunityDiscoveryQuery,
  CommunityDiscoveryQueryResult,
  CommunityDiscoveryUpdate,
  CommunityDiscoveryWrite,
} from "../../services/communityDiscovery/communityDiscoveryPersistence";

type Row = Record<string, unknown>;

type Filter =
  | { type: "eq"; column: string; value: string }
  | { type: "in"; column: string; values: readonly string[] };

export type CommunityDiscoveryDbFake = CommunityDiscoveryDb & {
  rows(table: string): Row[];
  seed(table: string, row: Row): Row;
  upserts: Array<{
    table: string;
    values: unknown;
    options: { onConflict: string; ignoreDuplicates?: boolean };
  }>;
  updates: Array<{
    table: string;
    values: Row;
    filters: Filter[];
  }>;
  queries: Array<{ table: string; filters: Filter[] }>;
  ignoreFilters: boolean;
  failWrites: boolean;
};

export function createCommunityDiscoveryDbFake(): CommunityDiscoveryDbFake {
  const tables = new Map<string, Row[]>([
    ["athena_public_communities", []],
    ["athena_organization_communities", []],
  ]);
  const fake = {
    upserts: [],
    updates: [],
    queries: [],
    ignoreFilters: false,
    failWrites: false,
    rows(table: string) {
      return (tables.get(table) ?? []).map((row) => ({ ...row }));
    },
    seed(table: string, row: Row) {
      const stored = { ...row };
      tables.get(table)?.push(stored);
      return { ...stored };
    },
    from(table: string) {
      return {
        select() {
          return createQuery(table);
        },
        update(values) {
          return createUpdate(table, { ...values });
        },
        upsert(values, options) {
          fake.upserts.push({
            table,
            values,
            options,
          });
          if (fake.failWrites) {
            return failedWrite();
          }
          const incoming = Array.isArray(values) ? values : [values];
          const affected: Row[] = [];
          const conflictColumns = options.onConflict.split(",").map((column) => column.trim());
          const bucket = tables.get(table);
          if (!bucket) {
            return failedWrite();
          }
          for (const value of incoming) {
            const row = { ...value };
            const index = bucket.findIndex((existing) =>
              conflictColumns.every((column) => existing[column] === row[column]),
            );
            if (index >= 0) {
              if (options.ignoreDuplicates) {
                continue;
              }
              bucket[index] = { ...bucket[index], ...row };
              affected.push(bucket[index]);
              continue;
            }
            const created: Row = {
              id: randomUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              suppression_state: "active",
              suppressed_at: null,
              ...row,
            };
            bucket.push(created);
            affected.push(created);
          }
          return {
            select() {
              const ids = affected.map((row) => String(row.id));
              return createQuery(table).in("id", ids);
            },
            then(
              onFulfilled?:
                | ((value: CommunityDiscoveryQueryResult) => unknown)
                | null,
              onRejected?: ((reason: unknown) => unknown) | null,
            ) {
              return Promise.resolve({ data: null, error: null }).then(
                onFulfilled,
                onRejected,
              );
            },
          };
        },
      };
    },
  } satisfies CommunityDiscoveryDbFake;

  function rowMatches(row: Row, filters: readonly Filter[]): boolean {
    return filters.every((filter) => {
      if (filter.type === "eq") return row[filter.column] === filter.value;
      return filter.values.includes(String(row[filter.column]));
    });
  }

  function createUpdate(table: string, values: Row): CommunityDiscoveryUpdate {
    const filters: Filter[] = [];
    const update: CommunityDiscoveryUpdate = {
      eq(column, value) {
        filters.push({ type: "eq", column, value });
        return update;
      },
      in(column, valuesIn) {
        filters.push({ type: "in", column, values: valuesIn });
        return update;
      },
      select() {
        const query: CommunityDiscoveryQuery = {
          eq() {
            return query;
          },
          in() {
            return query;
          },
          order() {
            return query;
          },
          limit() {
            return query;
          },
          maybeSingle() {
            return query;
          },
          single() {
            return query;
          },
          then(onFulfilled, onRejected) {
            return Promise.resolve()
              .then(() => applyUpdate(table, values, filters))
              .then(onFulfilled, onRejected);
          },
        };
        return query;
      },
    };
    return update;
  }

  function applyUpdate(
    table: string,
    values: Row,
    filters: readonly Filter[],
  ): CommunityDiscoveryQueryResult {
    fake.updates.push({
      table,
      values: { ...values },
      filters: filters.map((filter) =>
        filter.type === "in"
          ? { type: "in", column: filter.column, values: [...filter.values] }
          : { ...filter },
      ),
    });
    if (fake.failWrites) {
      return { data: null, error: { message: "write failed" } };
    }
    const bucket = tables.get(table);
    if (!bucket) return { data: null, error: { message: "missing table" } };
    const matched = fake.ignoreFilters
      ? bucket
      : bucket.filter((row) => rowMatches(row, filters));
    for (const row of matched) Object.assign(row, values);
    return { data: matched.map((row) => ({ ...row })), error: null };
  }

  function createQuery(table: string): CommunityDiscoveryQuery {
    const filters: Filter[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitCount: number | null = null;
    let mode: "many" | "single" | "maybe" = "many";

    const query: CommunityDiscoveryQuery = {
      eq(column, value) {
        filters.push({ type: "eq", column, value });
        return query;
      },
      in(column, values) {
        filters.push({ type: "in", column, values });
        return query;
      },
      order(column, options) {
        orderBy = { column, ascending: options.ascending };
        return query;
      },
      limit(count) {
        limitCount = count;
        return query;
      },
      maybeSingle() {
        mode = "maybe";
        return query;
      },
      single() {
        mode = "single";
        return query;
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve()
          .then(() => execute(table, filters, orderBy, limitCount, mode))
          .then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function execute(table: string, filters: Filter[], orderBy: { column: string; ascending: boolean } | null, limitCount: number | null, mode: "many" | "single" | "maybe"): CommunityDiscoveryQueryResult {
    fake.queries.push({ table, filters: fake.ignoreFilters ? [] : [...filters] });
    let matched = (tables.get(table) ?? []).map((row) => ({ ...row }));
    if (!fake.ignoreFilters) {
      for (const filter of filters) {
        matched = matched.filter((row) => {
          if (filter.type === "eq") return row[filter.column] === filter.value;
          return filter.values.includes(String(row[filter.column]));
        });
      }
    }
    if (orderBy) {
      const { column, ascending } = orderBy;
      matched.sort((left, right) => {
        const leftValue = String(left[column] ?? "");
        const rightValue = String(right[column] ?? "");
        const compared = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        return ascending ? compared : -compared;
      });
    }
    if (limitCount !== null) matched = matched.slice(0, limitCount);
    if (mode === "many") return { data: matched, error: null };
    if (matched.length > 1) {
      return { data: null, error: { message: "multiple rows" } };
    }
    if (mode === "maybe") {
      return { data: matched[0] ?? null, error: null };
    }
    if (!matched[0]) return { data: null, error: { message: "missing row" } };
    return { data: matched[0], error: null };
  }

  return fake;

  function failedWrite(): CommunityDiscoveryWrite &
    PromiseLike<CommunityDiscoveryQueryResult> {
    const result = Promise.resolve({
      data: null,
      error: { message: "write failed" },
    });
    const query: CommunityDiscoveryQuery = {
      eq() {
        return query;
      },
      in() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      maybeSingle() {
        return query;
      },
      single() {
        return query;
      },
      then(onFulfilled, onRejected) {
        return result.then(onFulfilled, onRejected);
      },
    };
    return {
      select() {
        return query;
      },
      then(onFulfilled, onRejected) {
        return result.then(onFulfilled, onRejected);
      },
    };
  }
}
