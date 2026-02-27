import { Authenticated, Refine } from "@refinedev/core";
import {
  BankOutlined,
  DashboardOutlined,
  TagsOutlined,
  SwapOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  AuthPage,
  ErrorComponent,
  ThemedLayout,
  useNotificationProvider,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { App as AntdApp } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import authProvider from "./authProvider";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { supabaseClient } from "./utility";
import { withSoftDelete } from "./utility/softDeleteDataProvider";
import { DashboardPage } from "./pages/dashboard";
import { TagList, TagCreate, TagEdit, TagShow } from "./pages/tags";
import {
  TransactionList,
  TransactionCreate,
  TransactionEdit,
  TransactionShow,
} from "./pages/transactions";

import {
  BankAccountList,
  BankAccountCreate,
  BankAccountEdit,
  BankAccountShow,
} from "./pages/bank-accounts";
import {
  CategoryList,
  CategoryCreate,
  CategoryEdit,
  CategoryShow,
} from "./pages/categories";
import { SettingsPage } from "./pages/settings";
import { ProjectTitle } from "./components/title";
import { Header, EnvironmentBanner } from "./components";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
            <Refine
              dataProvider={withSoftDelete(dataProvider(supabaseClient), supabaseClient)}
              liveProvider={liveProvider(supabaseClient)}
              authProvider={authProvider}
              routerProvider={routerProvider}
              notificationProvider={useNotificationProvider}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                projectId: "f28RTa-zPdRQM-EApdtq",
              }}
              resources={[
                {
                  name: "dashboard",
                  list: "/",
                  meta: {
                    label: "Dashboard",
                    icon: <DashboardOutlined />,
                  },
                },
                {
                  name: "transactions",
                  list: "/transactions",
                  create: "/transactions/create",
                  edit: "/transactions/edit/:id",
                  show: "/transactions/show/:id",
                  meta: {
                    label: "Transactions",
                    icon: <SwapOutlined />,
                  },
                },
                {
                  name: "categories",
                  list: "/categories",
                  create: "/categories/create",
                  edit: "/categories/edit/:id",
                  show: "/categories/show/:id",
                },
                {
                  name: "tags",
                  list: "/tags",
                  create: "/tags/create",
                  edit: "/tags/edit/:id",
                  show: "/tags/show/:id",
                  meta: {
                    label: "Tags",
                    icon: <TagsOutlined />,
                  },
                },

                {
                  name: "bank_accounts", // Database table name
                  list: "/bank-accounts",
                  create: "/bank-accounts/create",
                  edit: "/bank-accounts/edit/:id",
                  show: "/bank-accounts/show/:id",
                  meta: {
                    label: "Bank Accounts",
                    icon: <BankOutlined />,
                  },
                },
                {
                  name: "settings",
                  list: "/settings",
                  meta: {
                    label: "Settings",
                    icon: <SettingOutlined />,
                  },
                },
              ]}
            >
              <Routes>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-routes"
                      fallback={<CatchAllNavigate to="/login" />}
                    >
                      <EnvironmentBanner />
                      <ThemedLayout Header={Header} Title={ProjectTitle}>
                        <Outlet />
                      </ThemedLayout>
                    </Authenticated>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="transactions">
                    <Route index element={<TransactionList />} />
                    <Route path="create" element={<TransactionCreate />} />
                    <Route path="edit/:id" element={<TransactionEdit />} />
                    <Route path="show/:id" element={<TransactionShow />} />
                  </Route>

                  <Route path="categories">
                    <Route index element={<CategoryList />} />
                    <Route path="create" element={<CategoryCreate />} />
                    <Route path="edit/:id" element={<CategoryEdit />} />
                    <Route path="show/:id" element={<CategoryShow />} />
                  </Route>

                  <Route path="bank-accounts">
                    <Route index element={<BankAccountList />} />
                    <Route path="create" element={<BankAccountCreate />} />
                    <Route path="edit/:id" element={<BankAccountEdit />} />
                    <Route path="show/:id" element={<BankAccountShow />} />
                  </Route>

                  <Route path="tags">
                    <Route index element={<TagList />} />
                    <Route path="create" element={<TagCreate />} />
                    <Route path="edit/:id" element={<TagEdit />} />
                    <Route path="show/:id" element={<TagShow />} />
                  </Route>

                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route
                  element={
                    <Authenticated
                      key="auth-pages"
                      fallback={
                        <>
                          <EnvironmentBanner />
                          <Outlet />
                        </>
                      }
                    >
                      <NavigateToResource />
                    </Authenticated>
                  }
                >
                  <Route
                    path="/login"
                    element={<AuthPage type="login" title={<ProjectTitle />} />}
                  />
                  <Route
                    path="/register"
                    element={
                      <AuthPage type="register" title={<ProjectTitle />} />
                    }
                  />
                  <Route
                    path="/forgot-password"
                    element={
                      <AuthPage
                        type="forgotPassword"
                        title={<ProjectTitle />}
                      />
                    }
                  />
                  <Route
                    path="/update-password"
                    element={
                      <AuthPage
                        type="updatePassword"
                        title={<ProjectTitle />}
                      />
                    }
                  />
                </Route>
                <Route
                  element={
                    <Authenticated key="catch-all">
                      <ThemedLayout>
                        <Outlet />
                      </ThemedLayout>
                    </Authenticated>
                  }
                >
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
          </AntdApp>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
