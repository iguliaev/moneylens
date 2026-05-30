import { Typography } from "antd";
import {
  TREND_MUTED_COLOR,
  TREND_NEGATIVE_COLOR,
  TREND_POSITIVE_COLOR,
} from "../../../theme/tokens";

const { Text } = Typography;

export const TrendBadge = ({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) => {
  const baseStyle = {
    fontSize: 12,
    display: "block",
    marginTop: 4,
  } as const;

  if (previous === 0 && current === 0) {
    return (
      <Text style={{ ...baseStyle, color: TREND_MUTED_COLOR }}>
        — 0.0% vs prev period
      </Text>
    );
  }

  if (previous === 0) {
    const isPositive = current > 0;
    return (
      <Text
        style={{
          ...baseStyle,
          color: isPositive ? TREND_POSITIVE_COLOR : TREND_NEGATIVE_COLOR,
        }}
      >
        {isPositive ? "↑" : "↓"} New vs prev period
      </Text>
    );
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;

  if (pct === 0) {
    return (
      <Text style={{ ...baseStyle, color: TREND_MUTED_COLOR }}>
        → 0.0% vs prev period
      </Text>
    );
  }

  const isUp = pct > 0;
  return (
    <Text
      style={{
        ...baseStyle,
        color: isUp ? TREND_POSITIVE_COLOR : TREND_NEGATIVE_COLOR,
      }}
    >
      {isUp ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}% vs prev period
    </Text>
  );
};
