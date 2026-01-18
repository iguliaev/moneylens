import React from "react";
import { theme } from "antd";
import { Link } from "@refinedev/core";
export const ProjectTitle: React.FC = () => {
  const { token } = theme.useToken();
  const textColor = token.colorTextHeading;

  return (
    <Link to="/">
      <svg
        width="140"
        height="32"
        viewBox="0 0 140 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="0"
          y="24"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="24"
          fontWeight="bold"
          fill={textColor}
        >
          MoneyLens
        </text>
      </svg>
    </Link>
  );
};
