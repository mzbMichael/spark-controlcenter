export type TerminalPanelConfig = {
  enabled: boolean
  url: string
  breakpoint: number
  desktopWidth: number
  mobileHeight: number
  minSize: number
}

export const defaultTerminalPanelConfig: TerminalPanelConfig = {
  enabled: true,
  url: '/zellij/spark-dashboard',
  breakpoint: 1024,
  desktopWidth: 520,
  mobileHeight: 360,
  minSize: 220,
}

function finiteNumber(value: unknown, fallback: number, minimum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum
    ? value
    : fallback
}

export function normalizeTerminalPanelConfig(value: unknown): TerminalPanelConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultTerminalPanelConfig
  }

  const candidate = value as Record<string, unknown>
  return {
    enabled:
      typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : defaultTerminalPanelConfig.enabled,
    url:
      typeof candidate.url === 'string' && candidate.url.trim()
        ? candidate.url.trim()
        : defaultTerminalPanelConfig.url,
    breakpoint: finiteNumber(candidate.breakpoint, defaultTerminalPanelConfig.breakpoint, 480),
    desktopWidth: finiteNumber(
      candidate.desktopWidth,
      defaultTerminalPanelConfig.desktopWidth,
      160,
    ),
    mobileHeight: finiteNumber(
      candidate.mobileHeight,
      defaultTerminalPanelConfig.mobileHeight,
      160,
    ),
    minSize: finiteNumber(candidate.minSize, defaultTerminalPanelConfig.minSize, 120),
  }
}

export async function loadTerminalPanelConfig(signal?: AbortSignal): Promise<TerminalPanelConfig> {
  try {
    const response = await fetch('/terminal-config.json', { cache: 'no-store', signal })
    if (!response.ok) return defaultTerminalPanelConfig
    return normalizeTerminalPanelConfig(await response.json())
  } catch {
    return defaultTerminalPanelConfig
  }
}
