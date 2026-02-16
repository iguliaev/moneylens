import React from "react";
import { Alert } from "antd";

/**
 * EnvironmentBanner - Displays a sticky banner at the top of the application
 * to indicate non-production environments.
 *
 * Uses Ant Design Alert component with banner prop for consistency.
 *
 * Z-Index Strategy:
 * - EnvironmentBanner uses zIndex: 2 (positioned above Header)
 * - Header uses zIndex: 1
 * - Banner positioned above Header in DOM, ensuring proper stacking
 *
 * @returns Alert banner for staging/development, null for production
 */
const EnvironmentBanner: React.FC = () => {
  const environment = import.meta.env.VITE_APP_ENV;

  // Don't show banner in production
  if (environment === "production" || !environment) {
    return null;
  }

  // Configure based on environment
  const config = {
    staging: {
      type: "warning" as const, // Renders as light yellow/orange (#fffbe6)
      message: "STAGING Environment",
      description: "This is a staging environment - Not for production use",
      icon: "⚠️",
    },
    development: {
      type: "info" as const, // Renders as light blue (#e6f7ff)
      message: "DEVELOPMENT Environment",
      description: "This is a local development environment",
      icon: "🔧",
    },
  };

  const currentConfig = config[environment as keyof typeof config];

  // Fallback for unknown environments
  if (!currentConfig) {
    return (
      <Alert
        banner
        type="info"
        message={`${environment?.toUpperCase()} Environment`}
        showIcon={false}
        style={{ position: "sticky", top: 0, zIndex: 2 }}
      />
    );
  }

  return (
    <Alert
      banner
      type={currentConfig.type}
      message={
        <span>
          {currentConfig.icon} {currentConfig.message}
        </span>
      }
      description={currentConfig.description}
      showIcon={false}
      closable={false}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2, // Positioned above Header (zIndex: 1)
        borderRadius: 0,
      }}
    />
  );
};

export { EnvironmentBanner };
