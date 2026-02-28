import React from "react";
import {
  Card,
  Col,
  Progress,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import { AimOutlined } from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { useBudgets } from "./useBudgets";
import {
  TRANSACTION_TYPE_LABELS,
  TransactionType,
} from "../../constants/transactionTypes";
import { formatCurrency } from "../../utility/currency";

const { Text, Title } = Typography;

const TYPE_COLORS: Record<TransactionType, string> = {
  earn: "green",
  spend: "red",
  save: "blue",
};

const PROGRESS_STATUS: Record<
  TransactionType,
  "normal" | "exception" | "success"
> = {
  earn: "normal",
  spend: "exception",
  save: "success",
};

export const BudgetsSection: React.FC = () => {
  const { budgets, loading } = useBudgets();
  const { list } = useNavigation();

  return (
    <Card
      title={
        <Space>
          <AimOutlined />
          <span>Budgets</span>
        </Space>
      }
      extra={
        <Typography.Link onClick={() => list("budgets")}>
          Manage Budgets
        </Typography.Link>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : budgets.length === 0 ? (
        <Text type="secondary">
          No budgets yet.{" "}
          <Typography.Link onClick={() => list("budgets")}>
            Create one
          </Typography.Link>{" "}
          to start tracking your spending and savings goals.
        </Text>
      ) : (
        <Row gutter={[16, 16]}>
          {budgets.map((budget) => {
            const percent =
              budget.target_amount > 0
                ? Math.min(
                    100,
                    Math.round(
                      (budget.current_amount / budget.target_amount) * 100
                    )
                  )
                : 0;

            return (
              <Col xs={24} sm={12} lg={8} key={budget.id}>
                <Card size="small">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Space>
                      <Title level={5} style={{ margin: 0 }}>
                        {budget.name}
                      </Title>
                      <Tag color={TYPE_COLORS[budget.type]}>
                        {TRANSACTION_TYPE_LABELS[budget.type]}
                      </Tag>
                    </Space>
                    {budget.description && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {budget.description}
                      </Text>
                    )}
                    <Progress
                      percent={percent}
                      status={
                        percent >= 100
                          ? "success"
                          : PROGRESS_STATUS[budget.type]
                      }
                      format={() => `${percent}%`}
                    />
                    <Space
                      style={{ justifyContent: "space-between", width: "100%" }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatCurrency(budget.current_amount, "GBP")} of{" "}
                        {formatCurrency(budget.target_amount, "GBP")}
                      </Text>
                      {(budget.start_date || budget.end_date) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {budget.start_date ?? "—"} →{" "}
                          {budget.end_date ?? "ongoing"}
                        </Text>
                      )}
                    </Space>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </Card>
  );
};
