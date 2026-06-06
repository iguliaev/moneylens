import React from "react";
import { theme } from "antd";
import { Link } from "@refinedev/core";
import logoMarkUrl from "../../assets/logo-mark.svg";

export const ProjectTitle: React.FC = () => {
  const { token } = theme.useToken();

  return (
    <Link
      to="/"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        color: token.colorTextHeading,
        textDecoration: "none",
      }}
    >
      <img src={logoMarkUrl} alt="" aria-hidden width={32} height={32} />
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}>
        MoneyLens
      </span>
    </Link>
  );
};
