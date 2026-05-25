import { Priority, useRegisterActions } from "@refinedev/kbar";
import { useNavigation } from "@refinedev/core";

export const useQuickActions = () => {
  const { create } = useNavigation();

  useRegisterActions(
    [
      {
        id: "add-transaction",
        name: "Add Transaction",
        keywords: "new transaction add spend earn save",
        perform: () => create("transactions"),
        section: "Quick Actions",
        priority: Priority.HIGH,
      },
    ],
    []
  );
};
