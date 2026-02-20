import { ResourceList } from "../../components/resource-list";

export const TagList = () => {
  return (
    <ResourceList
      resource="tags_with_usage"
      deleteResource="tags"
      columns={[
        { dataIndex: "name", title: "Name" },
        { dataIndex: "description", title: "Description" },
        { dataIndex: "in_use_count", title: "Usage Count" },
      ]}
    />
  );
};
