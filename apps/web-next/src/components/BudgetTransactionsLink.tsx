import type { MouseEvent } from "react";
import { Button, Tooltip } from "antd";
import { UnorderedListOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";

interface BudgetTransactionsLinkProps {
  /** From useBudgetTransactionsLink; null when the budget has no live links. */
  path: string | null;
  /** Icon-only, for table rows. */
  compact?: boolean;
}

export const BudgetTransactionsLink = ({
  path,
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

  return (
    <Tooltip
      title={
        path
          ? "View transactions"
          : "Link a category or tag to see transactions"
      }
    >
      {button}
    </Tooltip>
  );
};
