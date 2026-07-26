import React, { useContext } from "react";
import { theme } from "antd";
import { Link } from "@refinedev/core";
import { ColorModeContext } from "../../contexts/color-mode";
import logoMarkLightUrl from "../../assets/logo-mark-light.svg";
import logoMarkDarkUrl from "../../assets/logo-mark-dark.svg";

interface ProjectTitleProps {
  // Unused, but kept so this satisfies Refine's `TitleProps` (Title={ProjectTitle}) shape.
  collapsed?: boolean;
  showText?: boolean;
}

export const ProjectTitle: React.FC<ProjectTitleProps> = ({
  showText = true,
}) => {
  const { token } = theme.useToken();
  const { mode } = useContext(ColorModeContext);
  const logoMarkUrl = mode === "dark" ? logoMarkDarkUrl : logoMarkLightUrl;

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
      {showText && (
        <span
          style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em" }}
        >
          MoneyLens
        </span>
      )}
    </Link>
  );
};
