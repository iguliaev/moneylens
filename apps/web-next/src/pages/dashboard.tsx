import { Card, Col, Row, Typography } from "antd";
const { Text } = Typography;

export const DashboardPage: React.FC = () => {
  return (
    <Row gutter={20}>
      <Col span={6}>
        <Card
          title="Spend"
          style={{ borderRadius: "15px" }}
          styles={{ header: { textAlign: "center" } }}
        >
          <Text>$0.00</Text>
        </Card>
      </Col>
      <Col span={6}>
        <Card
          title="Earned"
          style={{ borderRadius: "15px" }}
          styles={{ header: { textAlign: "center" } }}
        >
          <Text>$0.00</Text>
        </Card>
      </Col>
      <Col span={6}>
        <Card
          title="Saved"
          style={{ borderRadius: "15px" }}
          styles={{ header: { textAlign: "center" } }}
        >
          <Text>$0.00</Text>
        </Card>
      </Col>
    </Row>
  );
};
