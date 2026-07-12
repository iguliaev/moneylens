import type { PropsWithChildren } from "react";

export const PageWidthShell = ({ children }: PropsWithChildren) => {
  return (
    <div
      data-testid="page-width-shell"
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
};
