import React from "react";
import { theme } from "antd";
import { Link } from "@refinedev/core";

export const ProjectTitle: React.FC = () => {
  const { token } = theme.useToken();

  return (
    <Link to="/">
      <svg
        width="148"
        height="32"
        viewBox="0 0 148 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="MoneyLens"
      >
        {/* Lens icon: outer ring + inner circle */}
        <circle
          cx="14"
          cy="14"
          r="9"
          stroke={token.colorPrimary}
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="14" cy="14" r="4" fill={token.colorPrimary} opacity="0.75" />
        {/* Handle */}
        <line
          x1="20.5"
          y1="20.5"
          x2="26"
          y2="26"
          stroke={token.colorPrimary}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Wordmark */}
        <text
          x="34"
          y="22"
          fontFamily="inherit"
          fontSize="17"
          fontWeight="700"
          letterSpacing="-0.3"
          fill={token.colorTextHeading}
        >
          MoneyLens
        </text>
      </svg>
    </Link>
  );
};
