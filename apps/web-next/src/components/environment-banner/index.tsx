import React from "react";
import { Alert } from "antd";

const EnvironmentBanner: React.FC = () => {
  const environment = import.meta.env.VITE_APP_ENV;

  // Don't show banner in production
  if (environment === "production" || !environment) {
    return null;
  }

  // Configure based on environment
  const config = {
    staging: {
      type: "warning" as const,
      message: "STAGING Environment",
      description: "This is a staging environment - Not for production use",
      icon: "⚠️",
    },
    development: {
      type: "info" as const,
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
        style={{ position: "sticky", top: 0, zIndex: 1000 }}
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
        zIndex: 1000,
        borderRadius: 0,
      }}
    />
  );
};

export default EnvironmentBanner;
