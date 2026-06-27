import { Select, Typography } from "antd";
import { monthOptions, yearOptions } from "../constants/dateOptions";

const { Text } = Typography;

export type MonthRangePickerValue = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
};

type MonthRangePickerProps = MonthRangePickerValue & {
  onChange: (value: MonthRangePickerValue) => void;
  singleMonth?: boolean;
};

export const MonthRangePicker = ({
  startYear,
  startMonth,
  endYear,
  endMonth,
  onChange,
  singleMonth = false,
}: MonthRangePickerProps) => {
  const value = { startYear, startMonth, endYear, endMonth };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Text strong>{singleMonth ? "Year:" : "From:"}</Text>
      <Select
        aria-label={singleMonth ? "Year" : "From year"}
        value={startYear}
        onChange={(nextStartYear) =>
          onChange({ ...value, startYear: nextStartYear })
        }
        options={yearOptions}
        style={{ width: 100 }}
      />
      <Select
        aria-label={singleMonth ? "Month" : "From month"}
        value={startMonth}
        onChange={(nextStartMonth) =>
          onChange({ ...value, startMonth: nextStartMonth })
        }
        options={monthOptions}
        style={{ width: 130 }}
      />
      {!singleMonth && (
        <>
          <Text strong>To:</Text>
          <Select
            aria-label="To year"
            value={endYear}
            onChange={(nextEndYear) =>
              onChange({ ...value, endYear: nextEndYear })
            }
            options={yearOptions}
            style={{ width: 100 }}
          />
          <Select
            aria-label="To month"
            value={endMonth}
            onChange={(nextEndMonth) =>
              onChange({ ...value, endMonth: nextEndMonth })
            }
            options={monthOptions}
            style={{ width: 130 }}
          />
        </>
      )}
    </div>
  );
};
