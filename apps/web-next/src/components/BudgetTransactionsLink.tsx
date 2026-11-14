import type { MouseEvent } from "react";
import { Button, Tooltip } from "antd";
import { UnorderedListOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";
import type { BudgetLinkStatus } from "../hooks/useBudgetTransactionsLink";

interface BudgetTransactionsLinkProps {
  /** From useBudgetTransactionsLink; null when the budget has no live links. */
  path: string | null;
  /** From useBudgetTransactionsLink; says why a null path is null. */
  status: BudgetLinkStatus;
  /** Icon-only, for table rows. */
  compact?: boolean;
}

const tooltipFor = (path: string | null, status: BudgetLinkStatus): string => {
  if (path) return "View transactions";
  if (status === "loading") return "Loading…";
  if (status === "error") return "Couldn't load this budget's links";
  return "Link a category or tag to see transactions";
};

export const BudgetTransactionsLink = ({
  path,
  status,
  compact = false,
}: BudgetTransactionsLinkProps) => {
  const navigate = useNavigate();

  const onClick = (event: MouseEvent) => {
    // Let ctrl/cmd/shift-click open a new tab through the real href.
    if (!path || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(path);
  };

  const button = (
    <Button
      size={compact ? "small" : "middle"}
      type={compact ? "default" : "link"}
      style={compact ? undefined : { padding: 0, height: "auto" }}
      icon={<UnorderedListOutlined />}
      aria-label="View transactions"
      href={path ?? undefined}
      disabled={!path}
      onClick={onClick}
    >
      {compact ? null : "View transactions"}
    </Button>
  );

  return <Tooltip title={tooltipFor(path, status)}>{button}</Tooltip>;
};
