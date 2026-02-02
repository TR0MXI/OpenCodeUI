// ============================================
// Terminal - 单个 xterm 终端实例
// 使用 xterm.js + WebSocket 连接后端 PTY
// ============================================

import { useEffect, useRef, memo, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { getPtyConnectUrl, updatePtySession } from '../api/pty'
import { layoutStore } from '../store/layoutStore'

// ============================================
// 终端主题 - 与应用主题配合
// ============================================

// 获取 CSS 变量的实际 HSL 值并转换为 hex
function getHSLColor(varName: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!value) return ''
  
  // CSS 变量格式是 "h s% l%" 或 "h s l"
  const parts = value.split(/\s+/)
  if (parts.length < 3) return ''
  
  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100
  
  // HSL to RGB
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function getTerminalTheme(isDark: boolean) {
  // 从 CSS 变量获取背景色，与面板完全一致
  const bgColor = getHSLColor('--bg-100') || (isDark ? '#262422' : '#f5f2ed')
  const fgColor = getHSLColor('--text-100') || (isDark ? '#e8e0d5' : '#2d2a26')
  
  if (isDark) {
    return {
      background: bgColor,
      foreground: fgColor,
      cursor: '#e8e0d5',
      cursorAccent: '#1a1a1a',
      selectionBackground: '#4a4540',
      selectionForeground: '#e8e0d5',
      selectionInactiveBackground: '#3a3530',
      // ANSI colors - 暖色调适配
      black: '#1a1a1a',
      red: '#e55561',
      green: '#8cc265',
      yellow: '#d4a656',
      blue: '#6cb6ff',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#ff6b7a',
      brightGreen: '#a8e075',
      brightYellow: '#e5b567',
      brightBlue: '#82cfff',
      brightMagenta: '#de8ef0',
      brightCyan: '#70d0dc',
      brightWhite: '#ffffff',
    }
  } else {
    return {
      background: bgColor,
      foreground: fgColor,
      cursor: '#2d2a26',
      cursorAccent: '#f5f3ef',
      selectionBackground: '#d5d0c8',
      selectionForeground: '#2d2a26',
      selectionInactiveBackground: '#e5e0d8',
      // ANSI colors - 浅色模式
      black: '#2d2a26',
      red: '#c9514a',
      green: '#4a9f4a',
      yellow: '#b58900',
      blue: '#3a7fc9',
      magenta: '#a04a9f',
      cyan: '#3a9f9f',
      white: '#f5f3ef',
      brightBlack: '#6b6560',
      brightRed: '#e55561',
      brightGreen: '#6ab56a',
      brightYellow: '#d4a020',
      brightBlue: '#5a9fe0',
      brightMagenta: '#c06abf',
      brightCyan: '#5abfbf',
      brightWhite: '#ffffff',
    }
  }
}

function isDarkMode(): boolean {
  const mode = document.documentElement.getAttribute('data-mode')
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// ============================================
// Terminal Component
// ============================================

interface TerminalProps {
  ptyId: string
  directory?: string
  isActive: boolean
}

export const Terminal = memo(function Terminal({
  ptyId,
  directory,
  isActive,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const resizeTimeoutRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const isPanelResizingRef = useRef(false)
  // 追踪是否曾经变为活动状态（用于延迟连接 WebSocket）
  const [hasBeenActive, setHasBeenActive] = useState(isActive)

  // 当 tab 第一次变为活动状态时，标记它
  useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true)
    }
  }, [isActive, hasBeenActive])

  // 初始化终端 - 只在曾经活动过时才连接 WebSocket
  useEffect(() => {
    if (!containerRef.current) return
    // 如果从未活动过，不初始化
    if (!hasBeenActive) return
    
    // 标记组件已挂载
    mountedRef.current = true
    let ws: WebSocket | null = null
    let wsConnectTimeout: number | null = null

    const theme = getTerminalTheme(isDarkMode())
    
    const terminal = new XTerm({
      theme,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)
    
    // 尝试加载 WebGL 渲染器（大幅提升渲染性能）
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
      terminal.loadAddon(webglAddon)
      console.log('[Terminal] WebGL renderer enabled')
    } catch (e) {
      console.warn('[Terminal] WebGL not available, using canvas renderer')
    }
    
    // 初始 fit（使用 rAF 确保 DOM 已渲染）
    requestAnimationFrame(() => {
      if (mountedRef.current) {
        fitAddon.fit()
      }
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // 用 rAF 延迟连接 WebSocket（约16ms，比 setTimeout(100) 快6倍）
    // 这足以跳过 StrictMode 的同步卸载，同时保持快速响应
    const connectWs = () => {
      if (!mountedRef.current) {
        console.log('[Terminal] Skipping WS connect - unmounted')
        return
      }
      
      // 连接前先确保终端尺寸正确
      fitAddon.fit()
      
      const wsUrl = getPtyConnectUrl(ptyId, directory)
      console.log('[Terminal] Connecting to:', wsUrl)
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[Terminal] WebSocket connected:', ptyId)
        if (!mountedRef.current) return
        layoutStore.updateTerminalTab(ptyId, { status: 'connected' })
        const { cols, rows } = terminal
        console.log('[Terminal] Sending size:', cols, 'x', rows)
        updatePtySession(ptyId, { size: { cols, rows } }, directory).catch(() => {})
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        terminal.write(event.data)
      }

      ws.onclose = (e) => {
        console.log('[Terminal] WebSocket closed:', ptyId, e.code, e.reason)
        if (!mountedRef.current) return
        layoutStore.updateTerminalTab(ptyId, { status: 'disconnected' })
        terminal.write('\r\n\x1b[90m[Connection closed]\x1b[0m\r\n')
      }

      ws.onerror = (e) => {
        console.log('[Terminal] WebSocket error:', ptyId, e)
        if (!mountedRef.current) return
        layoutStore.updateTerminalTab(ptyId, { status: 'disconnected' })
      }

      // 终端输入发送到 WebSocket
      terminal.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    }
    
    wsConnectTimeout = requestAnimationFrame(connectWs) as unknown as number

    // 监听标题变化
    terminal.onTitleChange((title) => {
      if (!mountedRef.current) return
      layoutStore.updateTerminalTab(ptyId, { title })
    })

    return () => {
      mountedRef.current = false
      if (wsConnectTimeout) {
        cancelAnimationFrame(wsConnectTimeout)
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      if (ws) {
        ws.close()
      }
      terminal.dispose()
    }
  }, [ptyId, directory, hasBeenActive])

  // 处理大小变化
  useEffect(() => {
    if (!isActive || !fitAddonRef.current || !terminalRef.current) return

    const handleResize = () => {
      // 面板 resize 期间跳过
      if (isPanelResizingRef.current) return
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current && !isPanelResizingRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          // 通知后端调整 PTY 大小
          updatePtySession(ptyId, { size: { cols, rows } }, directory).catch(() => {})
        }
      }, 16) // 约一帧时间，更跟手
    }

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize)
    
    // 使用 ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    // 监听面板 resize 开始/结束
    const handlePanelResizeStart = () => {
      isPanelResizingRef.current = true
    }
    window.addEventListener('panel-resize-start', handlePanelResizeStart)

    // 初始 fit
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('panel-resize-start', handlePanelResizeStart)
      resizeObserver.disconnect()
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
    }
  }, [isActive, ptyId, directory])

  // 主题变化时更新
  useEffect(() => {
    const handleThemeChange = () => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = getTerminalTheme(isDarkMode())
      }
    }

    // 监听 data-mode 属性变化
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-mode') {
          handleThemeChange()
          break
        }
      }
    })

    observer.observe(document.documentElement, { attributes: true })

    return () => observer.disconnect()
  }, [])

  // 当 tab 变为活动状态时，聚焦并重新 fit
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      // 从隐藏变为可见时重新 fit（使用 rAF 确保布局完成）
      if (fitAddonRef.current) {
        requestAnimationFrame(() => {
          fitAddonRef.current?.fit()
        })
      }
    }
  }, [isActive])

  // 监听面板 resize 结束事件，重新 fit 终端
  useEffect(() => {
    if (!isActive) return
    
    const handlePanelResizeEnd = () => {
      isPanelResizingRef.current = false
      
      if (fitAddonRef.current && terminalRef.current) {
        // 使用 rAF 确保在下一帧渲染后再 fit
        requestAnimationFrame(() => {
          if (!fitAddonRef.current || !terminalRef.current) return
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          updatePtySession(ptyId, { size: { cols, rows } }, directory).catch(() => {})
        })
      }
    }
    
    window.addEventListener('panel-resize-end', handlePanelResizeEnd)
    return () => window.removeEventListener('panel-resize-end', handlePanelResizeEnd)
  }, [isActive, ptyId, directory])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        padding: '4px 8px 8px 8px',
        // 用 visibility + position 代替 display:none
        // 这样保持容器尺寸，xterm fit 才能正常工作
        visibility: isActive ? 'visible' : 'hidden',
        position: isActive ? 'relative' : 'absolute',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    />
  )
})
