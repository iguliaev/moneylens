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
import { Link } from "react-router";
import { ColorModeContext } from "../../contexts/color-mode";
import { useQuickActions } from "../../hooks/useQuickActions";

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
  value: label,
  label: (
    <Link to={path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <Text>{label}</Text>
    </Link>
  ),
});

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({
  sticky = true,
}) => {
  const { token } = useToken();
  const { data: user } = useGetIdentity<IUser>();
  const { mode, setMode } = useContext(ColorModeContext);
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

  // Debounce search → fire all three queries
  useEffect(() => {
    if (!value.trim()) {
      setOptions([]);
      return;
    }
    // stale flag: prevents results from an earlier search populating the dropdown
    // after a newer search has already started (race condition when typing slowly).
    let stale = false;
    const timer = setTimeout(() => {
      setOptions([]);
      txQuery.refetch().then((res) => {
        if (stale) return;
        const items = (res.data?.data ?? []) as Array<{ id: string | number; notes?: string }>;
        if (items.length) {
          setOptions((prev) => [
            ...prev,
            {
              label: renderTitle("Transactions", "/transactions"),
              options: items.map((t) =>
                renderItem(
                  t.notes ?? `Transaction #${t.id}`,
                  `/transactions/show/${t.id}`,
                  <FileTextOutlined />
                )
              ),
            },
          ]);
        }
      });
      catQuery.refetch().then((res) => {
        if (stale) return;
        const items = (res.data?.data ?? []) as Array<{ id: string | number; name: string }>;
        if (items.length) {
          setOptions((prev) => [
            ...prev,
            {
              label: renderTitle("Categories", "/categories"),
              options: items.map((c) =>
                renderItem(c.name, `/categories/show/${c.id}`, <AppstoreOutlined />)
              ),
            },
          ]);
        }
      });
      bankQuery.refetch().then((res) => {
        if (stale) return;
        const items = (res.data?.data ?? []) as Array<{ id: string | number; name: string }>;
        if (items.length) {
          setOptions((prev) => [
            ...prev,
            {
              label: renderTitle("Bank Accounts", "/bank_accounts"),
              options: items.map((b) =>
                renderItem(b.name, `/bank_accounts/show/${b.id}`, <BankOutlined />)
              ),
            },
          ]);
        }
      });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

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
              onSelect={() => setValue("")}
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
