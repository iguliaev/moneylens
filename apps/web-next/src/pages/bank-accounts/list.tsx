import React from "react";
import { ResourceList } from "../../components/resource-list";

export const BankAccountList = () => {
  return (
    <ResourceList
      resource="bank_accounts_with_usage"
      deleteResource="bank_accounts"
      columns={[
        { dataIndex: "name", title: "Name" },
        { dataIndex: "description", title: "Description" },
        { dataIndex: "in_use_count", title: "Usage Count" },
      ]}
    />
  );
};
