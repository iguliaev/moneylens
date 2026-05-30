import { AuthPage } from "@refinedev/antd";
import { theme } from "antd";
import { ProjectTitle } from "../title";

type BrandedAuthPageProps = {
  type: "login" | "register" | "forgotPassword" | "updatePassword";
};

export const BrandedAuthPage = ({ type }: BrandedAuthPageProps) => {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: token.colorBgLayout,
      }}
    >
      <div style={{ width: "100%", maxWidth: 560, padding: "24px 16px" }}>
        <AuthPage
          type={type}
          title={<ProjectTitle />}
          wrapperProps={{ style: { background: "transparent" } }}
          contentProps={{
            style: {
              width: "100%",
              maxWidth: 520,
              margin: "0 auto",
              padding: "28px 32px",
              borderRadius: token.borderRadiusLG,
              boxShadow: token.boxShadowSecondary,
            },
          }}
        />
      </div>
    </div>
  );
};
