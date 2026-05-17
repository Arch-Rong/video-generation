import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Button, Menu, Space } from 'antd'
import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useAppTheme } from '../providers/AppTheme'

export const Route = createRootRoute({
  component: RootLayout,
})

const navItems: MenuProps['items'] = [
  { key: '/', label: <Link to="/">创作</Link> },
  { key: '/api-test', label: <Link to="/api-test">API 调试</Link> },
  { key: '/yobox-test', label: <Link to="/yobox-test">Yobox</Link> },
]

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isDark, toggleTheme } = useAppTheme()

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md">
        <Menu
          mode="horizontal"
          selectedKeys={[pathname]}
          items={navItems}
          className="min-w-0 flex-1 !border-none !bg-transparent"
        />
        <Space>
          {
            import.meta.env.VITE_ARK_API_KEY
          }
          {
            import.meta.env.VITE_ARK_BASE_URL
          }
          <Button
            type="text"
            aria-label="切换主题"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
          />
        </Space>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
