import { theme, Typography } from "antd";

const { Text } = Typography;

export const TrendBadge = ({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) => {
  const { token } = theme.useToken();

  const baseStyle = {
    fontSize: 12,
    display: "block",
    marginTop: 4,
  } as const;

  if (previous === 0 && current === 0) {
    return (
      <Text style={{ ...baseStyle, color: token.colorTextSecondary }}>
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
          color: isPositive ? token.colorSuccess : token.colorError,
        }}
      >
        {isPositive ? "↑" : "↓"} New vs prev period
      </Text>
    );
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;

  if (pct === 0) {
    return (
      <Text style={{ ...baseStyle, color: token.colorTextSecondary }}>
        → 0.0% vs prev period
      </Text>
    );
  }

  const isUp = pct > 0;
  return (
    <Text style={{ ...baseStyle, color: isUp ? token.colorSuccess : token.colorError }}>
      {isUp ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}% vs prev period
    </Text>
  );
};
