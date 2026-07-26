import React, { useContext } from "react";
import { Link } from "@refinedev/core";
import { ColorModeContext } from "../../contexts/color-mode";
import logoMarkLightUrl from "../../assets/logo-mark-light.svg";
import logoMarkDarkUrl from "../../assets/logo-mark-dark.svg";
import logoLockupLightUrl from "../../assets/logo-lockup-light.svg";
import logoLockupDarkUrl from "../../assets/logo-lockup-dark.svg";
import logoFullLightUrl from "../../assets/logo-full-light.svg";
import logoFullDarkUrl from "../../assets/logo-full-dark.svg";

interface ProjectTitleProps {
  // Passed by Refine's Sider (Title={ProjectTitle}) when the sidebar is collapsed to icon-only.
  collapsed?: boolean;
  // Full logo lockup with tagline, for the login/register/auth pages.
  full?: boolean;
}

export const ProjectTitle: React.FC<ProjectTitleProps> = ({
  collapsed,
  full,
}) => {
  const { mode } = useContext(ColorModeContext);
  const isDark = mode === "dark";

  if (full) {
    return (
      <Link to="/" style={{ display: "inline-flex", textDecoration: "none" }}>
        <img
          src={isDark ? logoFullDarkUrl : logoFullLightUrl}
          alt="MoneyLens"
          height={96}
        />
      </Link>
    );
  }

  if (collapsed) {
    return (
      <Link to="/" style={{ display: "inline-flex", textDecoration: "none" }}>
        <img
          src={isDark ? logoMarkDarkUrl : logoMarkLightUrl}
          alt="MoneyLens"
          width={32}
          height={32}
        />
      </Link>
    );
  }

  return (
    <Link to="/" style={{ display: "inline-flex", textDecoration: "none" }}>
      <img
        src={isDark ? logoLockupDarkUrl : logoLockupLightUrl}
        alt="MoneyLens"
        height={44}
      />
    </Link>
  );
};
