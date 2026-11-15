import { useEffect, useState } from "react";
import {
  getBreakdown,
  getBreakdownMonthly,
  type BreakdownArgs,
} from "../utility/rpc";
import type { BreakdownMonthPoint, BreakdownRow } from "../utility/breakdown";
import { buildMonthlySeries } from "../utility/breakdown";
import { toError } from "../utility/errors";

interface RpcState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs `load` whenever `key` changes (and `enabled`), discarding a response
 * that arrives after a newer request started so a slow earlier call can never
 * overwrite the current one.
 */
const useRpcResult = <T>(
  key: string,
  enabled: boolean,
  empty: T,
  load: () => Promise<{ data: T | null; error: unknown }>
): RpcState<T> => {
  const [state, setState] = useState<RpcState<T>>({
    data: empty,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: empty, loading: false, error: null });
      return;
    }
    let stale = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load().then(
      ({ data, error }) => {
        if (stale) return;
        setState({
          data: error ? empty : (data ?? empty),
          loading: false,
          error: toError(error, "Failed to load the breakdown."),
        });
      },
      (thrown) => {
        if (stale) return;
        setState({
          data: empty,
          loading: false,
          error: toError(thrown, "Failed to load the breakdown."),
        });
      }
    );
    return () => {
      stale = true;
    };
    // `load` and `empty` are rebuilt every render; `key` already captures
    // every input they close over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
};

const argsKey = (args: BreakdownArgs) =>
  [
    args.dimension,
    args.type,
    args.start,
    args.end,
    args.groupByParent ? "parent" : "leaf",
  ].join("|");

const NO_ROWS: BreakdownRow[] = [];

/** The ranked list: one row per category / tag / bank account. */
export const useBreakdown = (args: BreakdownArgs, enabled: boolean) => {
  const { data, loading, error } = useRpcResult<BreakdownRow[]>(
    argsKey(args),
    enabled,
    NO_ROWS,
    async () => {
      const { data, error } = await getBreakdown(args);
      return {
        error,
        data: (data ?? []).map((r) => ({
          entityId: r.entity_id ?? null,
          name: r.entity_name,
          parentName: r.parent_name ?? null,
          memberIds: r.member_ids ?? null,
          total: Number(r.total),
          txCount: Number(r.tx_count),
        })),
      };
    }
  );
  return { rows: data, loading, error };
};

const NO_MONTHS: BreakdownMonthPoint[] = [];

/** One entity's totals per month, zero-filled across the whole period. */
export const useBreakdownMonthly = (
  args: BreakdownArgs,
  entityId: string | null,
  enabled: boolean
) => {
  const { data, loading, error } = useRpcResult<BreakdownMonthPoint[]>(
    `${argsKey(args)}|${entityId ?? "none"}`,
    enabled,
    NO_MONTHS,
    async () => {
      const { data, error } = await getBreakdownMonthly(args, entityId);
      return {
        error,
        data: buildMonthlySeries(data ?? [], args.start, args.end),
      };
    }
  );
  return { series: data, loading, error };
};
