import React, { useState } from "react";
import {
  Card,
  Typography,
  Upload,
  Button,
  Alert,
  List,
  Space,
  Modal,
  message,
  Divider,
} from "antd";
import {
  UploadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  TagsOutlined,
  BankOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { Link } from "react-router";
import { supabaseClient } from "../../utility";
import { Show } from "@refinedev/antd";

const { Title, Text, Paragraph } = Typography;

// === Types ===
interface CategoryInput {
  type: string;
  name: string;
  description?: string | null;
}

interface BankAccountInput {
  name: string;
  description?: string | null;
}

interface TagInput {
  name: string;
  description?: string | null;
}

interface BulkTransactionInput {
  date: string;
  type: string;
  amount: number;
  category?: string | null;
  bank_account?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

interface BulkUploadPayload {
  categories?: CategoryInput[];
  bank_accounts?: BankAccountInput[];
  tags?: TagInput[];
  transactions?: BulkTransactionInput[];
}

interface BulkUploadResult {
  success: boolean;
  error?: string;
  categories_inserted?: number;
  bank_accounts_inserted?: number;
  tags_inserted?: number;
  transactions_inserted?: number;
}

interface DataResetResult {
  success: boolean;
  transactions_deleted: number;
  categories_deleted: number;
  tags_deleted: number;
  bank_accounts_deleted: number;
}

// === Constants ===
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const MANAGE_LINKS = [
  { path: "/categories", label: "Categories", icon: <UnorderedListOutlined /> },
  { path: "/tags", label: "Tags", icon: <TagsOutlined /> },
  { path: "/bank-accounts", label: "Bank Accounts", icon: <BankOutlined /> },
];

// === Utilities ===
const parseUploadFile = (fileContent: string): BulkUploadPayload => {
  const parsed = JSON.parse(fileContent);

  // Handle legacy array format: [...]
  if (Array.isArray(parsed)) {
    return { transactions: parsed };
  }

  // Handle object format: { categories: [...], bank_accounts: [...], tags: [...], transactions: [...] }
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    return {
      categories: Array.isArray(obj.categories) ? obj.categories : undefined,
      bank_accounts: Array.isArray(obj.bank_accounts)
        ? obj.bank_accounts
        : undefined,
      tags: Array.isArray(obj.tags) ? obj.tags : undefined,
      transactions: Array.isArray(obj.transactions)
        ? obj.transactions
        : undefined,
    };
  }

  throw new Error(
    "JSON must be an array of transactions or an object with optional sections: categories, bank_accounts, tags, transactions"
  );
};

const getUploadSummary = (payload: BulkUploadPayload): string => {
  const parts: string[] = [];
  if (payload.categories?.length)
    parts.push(`${payload.categories.length} categories`);
  if (payload.bank_accounts?.length)
    parts.push(`${payload.bank_accounts.length} bank accounts`);
  if (payload.tags?.length) parts.push(`${payload.tags.length} tags`);
  if (payload.transactions?.length)
    parts.push(`${payload.transactions.length} transactions`);
  return parts.join(", ") || "No data";
};

// === Components ===
const BulkUploadSection: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  const handleFileChange: UploadProps["onChange"] = async (info) => {
    setResult(null);
    setFileError(null);
    setPreview(null);

    const file = info.fileList[0]?.originFileObj;
    setFileList(info.fileList.slice(-1)); // Keep only latest file

    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum allowed size is 1MB.");
      setFileList([]);
      return;
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileError("Invalid file type. Please upload a JSON file.");
      setFileList([]);
      return;
    }

    // Parse and preview
    try {
      const text = await file.text();
      const payload = parseUploadFile(text);
      setPreview(getUploadSummary(payload));
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Failed to parse JSON file."
      );
      setFileList([]);
    }
  };

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      setFileError("No file selected.");
      return;
    }

    setIsUploading(true);
    setFileError(null);
    setResult(null);

    try {
      const text = await file.text();
      const payload = parseUploadFile(text);

      // Validate that at least one section has data
      if (
        !payload.categories?.length &&
        !payload.bank_accounts?.length &&
        !payload.tags?.length &&
        !payload.transactions?.length
      ) {
        setFileError(
          "JSON must contain at least one of: categories, bank_accounts, tags, or transactions."
        );
        return;
      }

      // Call RPC
      const { data, error } = await supabaseClient.rpc("bulk_upload_data", {
        p_payload: payload,
      });

      if (error) {
        // Try to parse error details
        if (error.details) {
          try {
            const details = JSON.parse(error.details);
            if (Array.isArray(details) && details.length > 0) {
              setFileError(
                details.map((d: any) => `Row ${d.index}: ${d.error}`).join("\n")
              );
              return;
            }
          } catch {
            // Ignore parse error, use message
          }
        }
        throw new Error(error.message);
      }

      setResult(data as BulkUploadResult);
      setFileList([]);
      setPreview(null);
      message.success("Upload completed successfully!");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setFileList([]);
    setPreview(null);
    setFileError(null);
    setResult(null);
  };

  return (
    <Card title="Bulk Upload" extra={<FileTextOutlined />}>
      <Paragraph type="secondary">
        Upload a JSON file containing categories, bank accounts, tags, and/or
        transactions. Max file size: 1MB.
      </Paragraph>

      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Upload
          accept=".json,application/json"
          fileList={fileList}
          onChange={handleFileChange}
          beforeUpload={() => false} // Prevent auto-upload
          maxCount={1}
        >
          <Button icon={<UploadOutlined />}>Select JSON File</Button>
        </Upload>

        {preview && !fileError && (
          <Alert message={`Preview: ${preview}`} type="info" showIcon />
        )}

        {fileError && (
          <Alert
            message="Error"
            description={
              <pre style={{ whiteSpace: "pre-wrap" }}>{fileError}</pre>
            }
            type="error"
            showIcon
          />
        )}

        <Space>
          <Button
            type="primary"
            onClick={handleUpload}
            disabled={fileList.length === 0 || isUploading}
            loading={isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
          <Button onClick={handleClear}>Clear</Button>
        </Space>

        {result?.success && (
          <Alert
            message="Upload Successful"
            description={
              <List size="small">
                {result.categories_inserted ? (
                  <List.Item>
                    • {result.categories_inserted} categories inserted
                  </List.Item>
                ) : null}
                {result.bank_accounts_inserted ? (
                  <List.Item>
                    • {result.bank_accounts_inserted} bank accounts inserted
                  </List.Item>
                ) : null}
                {result.tags_inserted ? (
                  <List.Item>• {result.tags_inserted} tags inserted</List.Item>
                ) : null}
                {result.transactions_inserted ? (
                  <List.Item>
                    • {result.transactions_inserted} transactions inserted
                  </List.Item>
                ) : null}
              </List>
            }
            type="success"
            showIcon
          />
        )}
      </Space>
    </Card>
  );
};

const DataResetSection: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<DataResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResetData = async () => {
    setError(null);
    setIsDeleting(true);

    try {
      const { data, error: rpcError } = await supabaseClient.rpc(
        "reset_user_data"
      );

      if (rpcError) throw new Error(rpcError.message);

      setResult(data as DataResetResult);
      setIsModalOpen(false);
      message.success("Data reset completed successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset data");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        title="Danger Zone"
        extra={<DeleteOutlined style={{ color: "#ff4d4f" }} />}
        styles={{
          header: { borderColor: "#ffccc7", color: "#cf1322" },
          body: { borderColor: "#ffccc7", color: "#cf1322" },
        }}
      >
        <Paragraph>
          Permanently delete all your data. This action cannot be undone.
        </Paragraph>

        {result && (
          <Alert
            message="Data Reset Complete"
            description={
              <List size="small">
                <List.Item>
                  • {result.transactions_deleted} transactions deleted
                </List.Item>
                <List.Item>
                  • {result.categories_deleted} categories deleted
                </List.Item>
                <List.Item>• {result.tags_deleted} tags deleted</List.Item>
                <List.Item>
                  • {result.bank_accounts_deleted} bank accounts deleted
                </List.Item>
              </List>
            }
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Button
          danger
          onClick={() => setIsModalOpen(true)}
          disabled={isDeleting}
        >
          Reset All Data
        </Button>
      </Card>

      <Modal
        title="Reset All Data"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="confirm"
            danger
            type="primary"
            loading={isDeleting}
            onClick={handleResetData}
          >
            Yes, Delete Everything
          </Button>,
        ]}
      >
        <Alert
          message="Warning"
          description="This will permanently delete ALL your transactions, categories, tags, and bank accounts. This action cannot be undone."
          type="warning"
          showIcon
        />
      </Modal>
    </>
  );
};

// === Main Component ===
export const SettingsPage: React.FC = () => {
  return (
    <Show title="Settings" headerButtons={() => null}>
      <BulkUploadSection />

      <Divider />

      <DataResetSection />
    </Show>
  );
};

export default SettingsPage;
