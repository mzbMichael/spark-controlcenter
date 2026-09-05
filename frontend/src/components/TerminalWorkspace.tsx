import { ExternalLink, TerminalSquare } from 'lucide-react'
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  defaultTerminalPanelConfig,
  loadTerminalPanelConfig,
  type TerminalPanelConfig,
} from '@/lib/terminalConfig'

const DESKTOP_SIZE_KEY = 'spark-dashboard:terminal-width'
const MOBILE_SIZE_KEY = 'spark-dashboard:terminal-height'
const DASHBOARD_MIN_SIZE = 280

function storedSize(key: string, fallback: number): number {
  const value = Number.parseFloat(localStorage.getItem(key) ?? '')
  return Number.isFinite(value) ? value : fallback
}

function useDesktopLayout(breakpoint: number): boolean {
  const [desktop, setDesktop] = useState(() => window.innerWidth >= breakpoint)

  useEffect(() => {
    const update = () => setDesktop(window.innerWidth >= breakpoint)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [breakpoint])

  return desktop
}

export function TerminalWorkspace({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TerminalPanelConfig>(defaultTerminalPanelConfig)
  const [desktopSize, setDesktopSize] = useState(() =>
    storedSize(DESKTOP_SIZE_KEY, defaultTerminalPanelConfig.desktopWidth),
  )
  const [mobileSize, setMobileSize] = useState(() =>
    storedSize(MOBILE_SIZE_KEY, defaultTerminalPanelConfig.mobileHeight),
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const desktop = useDesktopLayout(config.breakpoint)

  useEffect(() => {
    const controller = new AbortController()
    loadTerminalPanelConfig(controller.signal).then((next) => {
      setConfig(next)
      if (localStorage.getItem(DESKTOP_SIZE_KEY) === null) setDesktopSize(next.desktopWidth)
      if (localStorage.getItem(MOBILE_SIZE_KEY) === null) setMobileSize(next.mobileHeight)
    })
    return () => controller.abort()
  }, [])

  if (!config.enabled) return <>{children}</>

  const size = desktop ? desktopSize : mobileSize
  const panelStyle: CSSProperties = desktop ? { width: size } : { height: size }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)

    const resize = (pointerEvent: PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds) return
      const available = desktop ? bounds.width : bounds.height
      const requested = desktop
        ? bounds.right - pointerEvent.clientX
        : bounds.bottom - pointerEvent.clientY
      const next = Math.round(
        Math.min(
          Math.max(requested, config.minSize),
          Math.max(config.minSize, available - DASHBOARD_MIN_SIZE),
        ),
      )
      if (desktop) {
        setDesktopSize(next)
        localStorage.setItem(DESKTOP_SIZE_KEY, String(next))
      } else {
        setMobileSize(next)
        localStorage.setItem(MOBILE_SIZE_KEY, String(next))
      }
    }

    const finish = () => {
      handle.removeEventListener('pointermove', resize)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
    }

    handle.addEventListener('pointermove', resize)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  return (
    <div
      ref={containerRef}
      className={`terminal-workspace ${desktop ? 'terminal-workspace--desktop' : 'terminal-workspace--mobile'}`}
    >
      <div className="terminal-dashboard">{children}</div>
      <div
        className="terminal-divider"
        role="separator"
        aria-label="Resize terminal panel"
        aria-orientation={desktop ? 'vertical' : 'horizontal'}
        onPointerDown={startResize}
      />
      <div className="terminal-panel" style={panelStyle} aria-label="Zellij terminal">
        <header className="terminal-panel__header">
          <span className="terminal-panel__title">
            <TerminalSquare size={14} aria-hidden="true" /> Zellij
          </span>
          <a
            href={config.url}
            target="_blank"
            rel="noreferrer"
            className="terminal-panel__external"
            title="Open terminal in a new tab"
          >
            <ExternalLink size={13} aria-hidden="true" />
            <span>Open</span>
          </a>
        </header>
        <iframe
          className="terminal-panel__frame"
          src={config.url}
          title="Zellij web terminal"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  )
}
