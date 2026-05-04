import { Empty, Button, Space } from "antd";
import React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Reusable empty state component for list pages.
 * Displays a title, description, and CTA button.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <Empty
    style={{ marginTop: 48 }}
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    description={
      <Space direction="vertical" size="small">
        <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 14, color: "#666" }}>{description}</div>
      </Space>
    }
  >
    <Button type="primary" onClick={onAction}>
      {actionLabel}
    </Button>
  </Empty>
);
