import { describe, expect, it } from 'vitest'
import { defaultTerminalPanelConfig, normalizeTerminalPanelConfig } from './terminalConfig'

describe('normalizeTerminalPanelConfig', () => {
  it('uses safe defaults for a missing document', () => {
    expect(normalizeTerminalPanelConfig(null)).toEqual(defaultTerminalPanelConfig)
  })

  it('accepts operator overrides', () => {
    expect(
      normalizeTerminalPanelConfig({
        enabled: false,
        url: '/zellij/work',
        breakpoint: 900,
        desktopWidth: 640,
        mobileHeight: 420,
        minSize: 180,
      }),
    ).toEqual({
      enabled: false,
      url: '/zellij/work',
      breakpoint: 900,
      desktopWidth: 640,
      mobileHeight: 420,
      minSize: 180,
    })
  })

  it('rejects blank URLs and unusable dimensions', () => {
    const result = normalizeTerminalPanelConfig({
      url: ' ',
      breakpoint: 20,
      desktopWidth: -1,
      mobileHeight: Number.NaN,
      minSize: 0,
    })
    expect(result).toEqual(defaultTerminalPanelConfig)
  })
})
