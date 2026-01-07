import { Authenticated, Refine, WelcomePage } from "@refinedev/core";
import { DashboardOutlined } from "@ant-design/icons";
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
import { DashboardPage } from "./pages/dashboard";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
            <Refine
              dataProvider={dataProvider(supabaseClient)}
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
              ]}
            >
              <Routes>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-routes"
                      fallback={<CatchAllNavigate to="/login" />}
                    >
                      <ThemedLayout>
                        <Outlet />
                      </ThemedLayout>
                    </Authenticated>
                  }
                >
                <Route index element={<DashboardPage />} />
                </Route>
                <Route
                  element={
                    <Authenticated key="auth-pages" fallback={<Outlet />}>
                      <NavigateToResource />
                    </Authenticated>
                  }
                >
                  <Route path="/login" element={<AuthPage type="login" />} />
                  <Route
                    path="/register"
                    element={<AuthPage type="register" />}
                  />
                  <Route
                    path="/forgot-password"
                    element={<AuthPage type="forgotPassword" />}
                  />
                  <Route
                    path="/update-password"
                    element={<AuthPage type="updatePassword" />}
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
