import {
  Button,
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
import { useEffect, useState } from "react";
import { useBudgets } from "./useBudgets";
import {
  TRANSACTION_TYPE_LABELS,
  TYPE_COLORS,
} from "../../constants/transactionTypes";
import { formatCurrency } from "../../utility/currency";
import { useCurrency } from "../../contexts/currency";
import {
  getBudgetAlertState,
  getProgressStatus,
  WARN_STROKE_COLOR,
} from "../../utility/budgetAlerts";

const { Text, Title } = Typography;

export const BudgetsSection = () => {
  const { budgets, loading } = useBudgets();
  const { list } = useNavigation();
  const { currency } = useCurrency();
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!loading && budgets.length > 0) {
      const timer = setTimeout(() => setAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading, budgets.length]);

  return (
    <Card
      title={
        <Space>
          <AimOutlined />
          <span>Budgets</span>
        </Space>
      }
      extra={
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => list("budgets")}
        >
          Manage Budgets
        </Button>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : budgets.length === 0 ? (
        <Text type="secondary">
          No budgets yet.{" "}
          <Button
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={() => list("budgets")}
          >
            Create one
          </Button>{" "}
          to start tracking your spending and savings goals.
        </Text>
      ) : (
        <Row gutter={[16, 16]}>
          {budgets.map((budget) => {
            const { percent, alertLevel } = getBudgetAlertState(
              budget.current_amount,
              budget.target_amount,
              budget.type,
            );

            const progressStatus = getProgressStatus(
              alertLevel,
              percent,
              budget.type,
            );

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
                      {alertLevel === "warn" && (
                        <Tag color="warning">⚠ Near limit</Tag>
                      )}
                      {alertLevel === "over" && (
                        <Tag color="error">Over budget</Tag>
                      )}
                    </Space>
                    {budget.description && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {budget.description}
                      </Text>
                    )}
                    <Progress
                      percent={animated ? percent : 0}
                      status={progressStatus}
                      strokeColor={
                        alertLevel === "warn" ? WARN_STROKE_COLOR : undefined
                      }
                      format={() => `${percent}%`}
                    />
                    <Space
                      style={{ justifyContent: "space-between", width: "100%" }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatCurrency(budget.current_amount, currency)} of{" "}
                        {formatCurrency(budget.target_amount, currency)}
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
