import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

type ThemeMode = 'light' | 'dark' | 'system'

interface AppThemeContextValue {
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'studio-theme-mode'

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemPrefersDark()
}

function applyThemeToDocument(isDark: boolean) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(isDark ? 'dark' : 'light')
  root.style.colorScheme = isDark ? 'dark' : 'light'
}

function readStoredMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)

  const [isDark, setIsDark] = useState(() => {
    const dark = resolveIsDark(readStoredMode())
    applyThemeToDocument(dark)
    return dark
  })

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark')
  }, [isDark, setMode])

  useEffect(() => {
    const apply = () => setIsDark(resolveIsDark(mode))
    apply()

    if (mode !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  useLayoutEffect(() => {
    applyThemeToDocument(isDark)
  }, [isDark])

  const contextValue = useMemo(
    () => ({ mode, isDark, setMode, toggleTheme }),
    [mode, isDark, setMode, toggleTheme],
  )

  return (
    <AppThemeContext.Provider value={contextValue}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#7c3aed',
            borderRadius: 10,
            fontFamily:
              "system-ui, 'Segoe UI', Roboto, 'PingFang SC', sans-serif",
          },
        }}
      >
        {children}
      </ConfigProvider>
    </AppThemeContext.Provider>
  )
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext)
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider')
  return ctx
}
