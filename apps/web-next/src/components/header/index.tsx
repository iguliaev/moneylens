import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useGetIdentity, useList } from "@refinedev/core";
import {
  AutoComplete,
  Avatar,
  Col,
  Grid,
  Input,
  Layout as AntdLayout,
  Row,
  Space,
  Switch,
  Tag,
  theme,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  BankOutlined,
  FileTextOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  TRANSACTION_TYPE_LABELS,
  TYPE_COLORS,
} from "../../constants/transactionTypes";
import type { TransactionType } from "../../constants/transactionTypes";
import { ColorModeContext } from "../../contexts/color-mode";
import { useCurrency } from "../../contexts/currency";
import { useQuickActions } from "../../hooks/useQuickActions";
import { formatCurrency } from "../../utility/currency";

const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

type IUser = {
  id: number;
  name: string;
  avatar: string;
};

interface IOption {
  value: string;
  label: React.ReactNode;
}

interface IOptionGroup {
  label: React.ReactNode;
  options: IOption[];
}

const renderTitle = (title: string, path: string) => (
  <div style={{ display: "flex", justifyContent: "space-between" }}>
    <Text strong>{title}</Text>
    <Link to={path}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        View all →
      </Text>
    </Link>
  </div>
);

const renderItem = (
  label: string,
  path: string,
  icon: React.ReactNode
): IOption => ({
  value: path,
  label: (
    <Link to={path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <Text>{label}</Text>
    </Link>
  ),
});

interface ITransactionResult {
  id: string | number;
  notes?: string;
  date?: string;
  amount?: number;
  type?: TransactionType;
  category_name?: string;
}

const renderTransactionItem = (
  t: ITransactionResult,
  currency: string
): IOption => {
  const note = t.notes ?? `Transaction #${t.id}`;
  const formattedDate = t.date
    ? new Date(t.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const meta = [t.category_name, formattedDate].filter(Boolean).join(" · ");

  return {
    value: `/transactions/show/${t.id}`,
    label: (
      <Link
        to={`/transactions/show/${t.id}`}
        style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
      >
        <FileTextOutlined style={{ marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text strong ellipsis style={{ flex: 1 }}>{note}</Text>
            <Space size={4}>
              {t.amount != null && (
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {formatCurrency(t.amount, currency)}
                </Text>
              )}
              {t.type && (
                <Tag color={TYPE_COLORS[t.type]} style={{ margin: 0, fontSize: 11 }}>
                  {TRANSACTION_TYPE_LABELS[t.type]}
                </Tag>
              )}
            </Space>
          </div>
          {meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {meta}
            </Text>
          )}
        </div>
      </Link>
    ),
  };
};

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({
  sticky = true,
}) => {
  const { token } = useToken();
  const { data: user } = useGetIdentity<IUser>();
  const { mode, setMode } = useContext(ColorModeContext);
  const { currency } = useCurrency();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  useQuickActions();

  const [value, setValue] = useState("");
  const [options, setOptions] = useState<IOptionGroup[]>([]);

  const { query: txQuery } = useList({
    resource: "transactions_with_details",
    filters: [{ field: "notes", operator: "contains", value }],
    pagination: { pageSize: 5 },
    queryOptions: { enabled: false },
  });

  const { query: catQuery } = useList({
    resource: "categories",
    filters: [{ field: "name", operator: "contains", value }],
    pagination: { pageSize: 5 },
    queryOptions: { enabled: false },
  });

  const { query: bankQuery } = useList({
    resource: "bank_accounts",
    filters: [{ field: "name", operator: "contains", value }],
    pagination: { pageSize: 5 },
    queryOptions: { enabled: false },
  });

  // Extract stable refetch refs so they can be listed as effect deps
  // without triggering re-runs on every render.
  const txRefetch = txQuery.refetch;
  const catRefetch = catQuery.refetch;
  const bankRefetch = bankQuery.refetch;

  // Debounce search → fire all three queries in parallel, then set results in
  // a fixed order (Transactions → Categories → Bank Accounts).
  // The stale flag prevents results from an earlier query populating the
  // dropdown after a newer query has already started.
  useEffect(() => {
    if (!value.trim()) {
      setOptions([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      setOptions([]);
      Promise.all([txRefetch(), catRefetch(), bankRefetch()])
        .then(([txRes, catRes, bankRes]) => {
          if (stale) return;
          const newOptions: IOptionGroup[] = [];

          const txItems = (txRes.data?.data ?? []) as ITransactionResult[];
          if (txItems.length) {
            newOptions.push({
              label: renderTitle("Transactions", "/transactions"),
              options: txItems.map((t) => renderTransactionItem(t, currency)),
            });
          }

          const catItems = (catRes.data?.data ?? []) as Array<{ id: string | number; name: string }>;
          if (catItems.length) {
            newOptions.push({
              label: renderTitle("Categories", "/categories"),
              options: catItems.map((c) =>
                renderItem(c.name, `/categories/show/${c.id}`, <AppstoreOutlined />)
              ),
            });
          }

          const bankItems = (bankRes.data?.data ?? []) as Array<{ id: string | number; name: string }>;
          if (bankItems.length) {
            newOptions.push({
              label: renderTitle("Bank Accounts", "/bank_accounts"),
              options: bankItems.map((b) =>
                renderItem(b.name, `/bank_accounts/show/${b.id}`, <BankOutlined />)
              ),
            });
          }

          setOptions(newOptions);
        })
        .catch(() => {
          if (!stale) setOptions([]);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, currency, txRefetch, catRefetch, bankRefetch]);

  const headerStyles: React.CSSProperties = {
    backgroundColor: token.colorBgElevated,
    padding: "0px 24px",
    height: "64px",
  };

  if (sticky) {
    headerStyles.position = "sticky";
    headerStyles.top = 0;
    headerStyles.zIndex = 1; // Base z-index; EnvironmentBanner uses zIndex: 2
  }

  return (
    <AntdLayout.Header style={headerStyles}>
      <Row align="middle" style={{ height: "100%" }}>
        {screens.sm && (
          <Col flex="auto">
            <AutoComplete
              style={{ width: "100%", maxWidth: 400 }}
              options={options}
              filterOption={false}
              value={value}
              onSearch={setValue}
              onSelect={(path) => {
                navigate(path);
                setValue("");
              }}
            >
              <Input
                prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                placeholder="Search transactions, categories, accounts…"
                aria-label="global search"
              />
            </AutoComplete>
          </Col>
        )}
        <Col flex="none">
          <Space>
            <Switch
              checkedChildren="🌛"
              unCheckedChildren="🔆"
              onChange={() => setMode(mode === "light" ? "dark" : "light")}
              defaultChecked={mode === "dark"}
              aria-label="Toggle color mode"
            />
            <Space style={{ marginLeft: "8px" }} size="middle">
              {user?.name && <Text strong>{user.name}</Text>}
              {user?.avatar && <Avatar src={user?.avatar} alt={user?.name} />}
            </Space>
          </Space>
        </Col>
      </Row>
    </AntdLayout.Header>
  );
};
