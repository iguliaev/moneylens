import { Card, Col, Row, Statistic } from "antd";
import { TrendBadge } from "./TrendBadge";
import { useCurrency } from "../../../contexts/currency";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  TYPE_VALUE_COLORS,
} from "../../../constants/transactionTypes";
import { type TypeSummary } from "../../../hooks";
import { formatCurrency } from "../../../utility/currency";

export const TypeSummaryCards = ({
  data,
  previousData,
  loading,
}: {
  data: TypeSummary[];
  previousData: TypeSummary[] | null;
  loading: boolean;
}) => {
  const { currency } = useCurrency();
  const getAmount = (type: TransactionType, source: TypeSummary[] = data) =>
    source.find((d) => d.type === type)?.total ?? 0;

  const earnings = getAmount(TRANSACTION_TYPES.EARN);
  const spending = getAmount(TRANSACTION_TYPES.SPEND);
  const netIncome = earnings - spending;
  const prevEarnings = getAmount(TRANSACTION_TYPES.EARN, previousData ?? []);
  const prevSpending = getAmount(TRANSACTION_TYPES.SPEND, previousData ?? []);
  const prevNetIncome = prevEarnings - prevSpending;

  return (
    <Row gutter={[16, 16]}>
      {Object.values(TRANSACTION_TYPES).map((type) => {
        const current = getAmount(type);
        const previous = getAmount(type, previousData ?? []);
        return (
          <Col xs={24} sm={12} lg={6} key={type}>
            <Card>
              <Statistic
                title={TRANSACTION_TYPE_LABELS[type]}
                value={current}
                precision={2}
                formatter={(value) =>
                  formatCurrency(
                    typeof value === "number" ? value : 0,
                    currency
                  )
                }
                loading={loading}
                valueStyle={{ color: TYPE_VALUE_COLORS[type] }}
              />
              {!loading && previousData !== null && (
                <TrendBadge current={current} previous={previous} />
              )}
            </Card>
          </Col>
        );
      })}
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Net Income"
            value={netIncome}
            precision={2}
            formatter={(value) =>
              formatCurrency(
                typeof value === "number" ? value : 0,
                currency
              )
            }
            loading={loading}
            valueStyle={{
              color:
                netIncome > 0
                  ? "#52c41a"
                  : netIncome < 0
                    ? "#ff4d4f"
                    : undefined,
            }}
          />
          {!loading && previousData !== null && (
            <TrendBadge current={netIncome} previous={prevNetIncome} />
          )}
        </Card>
      </Col>
    </Row>
  );
};
