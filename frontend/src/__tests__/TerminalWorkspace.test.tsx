import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { TerminalWorkspace } from '../components/TerminalWorkspace'

describe('TerminalWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1400 })
  })

  it('embeds the named Zellij session beside the dashboard on a wide viewport', () => {
    const { container } = render(
      <TerminalWorkspace>
        <div>Dashboard</div>
      </TerminalWorkspace>,
    )

    expect(container.firstElementChild).toHaveClass('terminal-workspace--desktop')
    expect(screen.getByTitle('Zellij web terminal')).toHaveAttribute(
      'src',
      '/zellij/spark-dashboard',
    )
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('moves the terminal below the dashboard on a narrow viewport', () => {
    const { container } = render(
      <TerminalWorkspace>
        <div>Dashboard</div>
      </TerminalWorkspace>,
    )

    window.innerWidth = 800
    fireEvent(window, new Event('resize'))

    expect(container.firstElementChild).toHaveClass('terminal-workspace--mobile')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })
})
