import { Button, Card, Col, ConfigProvider, Layout, Row, Space, Statistic, Tag, Typography } from 'antd'
import { DashboardOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppStore } from './stores/app-store'
import './App.css'

const { Content, Header } = Layout
const { Title, Paragraph } = Typography

function App() {
  const { platformName, isSidebarCollapsed, toggleSidebar } = useAppStore()

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
      <Layout className="app-shell">
        <Header className="app-header">
          <Space size="middle">
            <DashboardOutlined className="brand-icon" />
            <span className="brand-name">{platformName}</span>
            <Tag color="processing">工程化基线已启用</Tag>
          </Space>
          <Button icon={<SettingOutlined />} onClick={toggleSidebar}>
            {isSidebarCollapsed ? '展开设置' : '收起设置'}
          </Button>
        </Header>
        <Content className="app-content">
          <section className="hero-section">
            <Title>地面控制站前端工程</Title>
            <Paragraph>
              基于 React、TypeScript、Zustand 与 Ant Design 的可扩展前端基线，已集成质量、测试和多端适配规范。
            </Paragraph>
            <Space wrap>
              <Button type="primary" size="large">开始开发</Button>
              <Button size="large" href="/docs/development-guide.md" target="_blank">查看开发规范</Button>
            </Space>
          </section>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={8}><Card><Statistic title="构建工具" value="Vite" /></Card></Col>
            <Col xs={24} sm={12} lg={8}><Card><Statistic title="状态管理" value="Zustand" /></Card></Col>
            <Col xs={24} sm={12} lg={8}><Card><Statistic title="组件体系" value="Ant Design" /></Card></Col>
          </Row>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App
