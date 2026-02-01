// ============================================
// BottomPanel - 底部面板容器
// 支持多标签、resize、右键菜单移动
// 性能优化：resize 期间使用 CSS visibility:hidden 完全跳过布局计算
// ============================================

import { memo, useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Terminal } from './Terminal'
import { TerminalIcon } from './Icons'
import { PanelContainer } from './PanelContainer'
import { layoutStore, useLayoutStore, type TerminalTab, type PanelTab } from '../store/layoutStore'
import { createPtySession, removePtySession, listPtySessions } from '../api/pty'
import { SessionChangesPanel } from './SessionChangesPanel'
import { FileExplorer } from './FileExplorer'
import { useMessageStore } from '../store'

// 常量
const MIN_HEIGHT = 100
const MAX_HEIGHT = 600

interface BottomPanelProps {
  directory?: string
}

export const BottomPanel = memo(function BottomPanel({ directory }: BottomPanelProps) {
  const { bottomPanelOpen, bottomPanelHeight, previewFile } = useLayoutStore()
  const { sessionId } = useMessageStore()
  
  const [isResizing, setIsResizing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)
  const rafRef = useRef<number>(0)
  const currentHeightRef = useRef(bottomPanelHeight)

  // 同步 store 高度到 CSS 变量
  useLayoutEffect(() => {
    if (!isResizing && panelRef.current) {
      panelRef.current.style.setProperty('--panel-height', `${bottomPanelHeight}px`)
      currentHeightRef.current = bottomPanelHeight
    }
  }, [bottomPanelHeight, isResizing])

  // 页面加载时恢复已有的 PTY sessions
  useEffect(() => {
    if (restoredRef.current || !directory) return
    restoredRef.current = true

    const restoreSessions = async () => {
      try {
        setIsRestoring(true)
        const sessions = await listPtySessions(directory)
        console.log('[BottomPanel] Found existing PTY sessions:', sessions)
        
        if (sessions.length > 0) {
          for (const pty of sessions) {
            if (!layoutStore.getTerminalTabs().some(t => t.id === pty.id)) {
              const tab: TerminalTab = {
                id: pty.id,
                title: pty.title || 'Terminal',
                status: pty.running ? 'connecting' : 'exited',
              }
              layoutStore.addTerminalTab(tab, false)
            }
          }
        }
      } catch (error) {
        console.error('[BottomPanel] Failed to restore sessions:', error)
      } finally {
        setIsRestoring(false)
      }
    }

    restoreSessions()
  }, [directory])

  // 创建新终端
  const handleNewTerminal = useCallback(async () => {
    try {
      console.log('[BottomPanel] Creating PTY session, directory:', directory)
      const pty = await createPtySession({ cwd: directory }, directory)
      console.log('[BottomPanel] PTY created:', pty)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || 'Terminal',
        status: 'connecting',
      }
      layoutStore.addTerminalTab(tab)
    } catch (error) {
      console.error('[BottomPanel] Failed to create terminal:', error)
    }
  }, [directory])

  // 关闭终端
  const handleCloseTerminal = useCallback(async (ptyId: string) => {
    try {
      await removePtySession(ptyId, directory)
    } catch {
      // ignore - may already be closed
    }
  }, [directory])

  // 拖拽调整高度 - 使用 CSS 变量 + requestAnimationFrame + visibility:hidden 优化
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    
    const panel = panelRef.current
    const content = contentRef.current
    if (!panel || !content) return
    
    setIsResizing(true)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    
    // 立即隐藏内容以跳过布局计算 (display:none 比 visibility:hidden 更彻底)
    window.dispatchEvent(new CustomEvent('panel-resize-start'))
    content.style.display = 'none'
    
    const startY = e.clientY
    const startHeight = currentHeightRef.current
    
    // 使用 requestAnimationFrame 优化 mousemove
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        const deltaY = startY - moveEvent.clientY
        const newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT)
        // 直接修改 CSS 变量，不触发 React 重新渲染
        panel.style.setProperty('--panel-height', `${newHeight}px`)
        currentHeightRef.current = newHeight
      })
    }
    
    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      // 恢复内容显示
      if (content) {
        content.style.display = ''
        // 触发终端重新计算尺寸
        window.dispatchEvent(new CustomEvent('panel-resize-end'))
      }
      
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // 只在 mouseup 时更新 store
      layoutStore.setBottomPanelHeight(currentHeightRef.current)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // 渲染内容
  const renderContent = useCallback((activeTab: PanelTab | null) => {
    if (isRestoring) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
          <TerminalIcon size={24} className="opacity-30 animate-pulse" />
          <span>Restoring sessions...</span>
        </div>
      )
    }

    if (!activeTab) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
          <TerminalIcon size={24} className="opacity-30" />
          <span>No content</span>
          <button
            onClick={handleNewTerminal}
            className="px-3 py-1.5 text-xs bg-bg-200/50 hover:bg-bg-200 text-text-200 rounded-md transition-colors"
          >
            Create Terminal
          </button>
        </div>
      )
    }

    switch (activeTab.type) {
      case 'terminal':
        return (
          <TerminalContent
            activeTab={activeTab}
            directory={directory}
          />
        )
      case 'files':
        return (
          <FileExplorer 
            directory={directory ?? ''}
            previewFile={previewFile}
            position="bottom"
            isPanelResizing={isResizing}
          />
        )
      case 'changes':
        if (!sessionId) {
          return (
            <div className="flex items-center justify-center h-full text-text-400 text-xs">
              No active session
            </div>
          )
        }
        return <SessionChangesPanel sessionId={sessionId} isResizing={isResizing} />
      default:
        return null
    }
  }, [isRestoring, handleNewTerminal, directory, previewFile, sessionId, isResizing])

  if (!bottomPanelOpen) {
    return null
  }

  return (
    <div 
      ref={panelRef}
      className="flex flex-col bg-bg-100 relative"
      style={{ 
        '--panel-height': `${bottomPanelHeight}px`,
        height: 'var(--panel-height)' 
      } as React.CSSProperties}
    >
      {/* Resize Handle - 扩大拖拽区域 */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-2 cursor-row-resize z-50
          hover:bg-accent-main-100/30 transition-colors -translate-y-1/2
          ${isResizing ? 'bg-accent-main-100/50' : 'bg-transparent'}
        `}
        onMouseDown={handleResizeStart}
      />

      {/* Resize 时的遮罩层，防止内容交互影响性能 */}
      {isResizing && (
        <div className="absolute inset-0 z-40 bg-transparent pointer-events-auto" />
      )}
      
      {/* Top Border */}
      <div className="h-px bg-border-200/50 shrink-0" />

      {/* Content Container - visibility:hidden during resize */}
      <div ref={contentRef} className="flex-1 flex flex-col min-h-0">
        {/* Panel Container with Tabs */}
        <PanelContainer
          position="bottom"
          onNewTerminal={handleNewTerminal}
          onCloseTerminal={handleCloseTerminal}
        >
          {renderContent}
        </PanelContainer>
      </div>
    </div>
  )
})

// ============================================
// Terminal Content - 渲染所有终端实例
// ============================================

interface TerminalContentProps {
  activeTab: PanelTab
  directory?: string
}

const TerminalContent = memo(function TerminalContent({ 
  activeTab,
  directory,
}: TerminalContentProps) {
  const { panelTabs } = useLayoutStore()
  
  // 获取所有 bottom 位置的 terminal tabs
  const terminalTabs = panelTabs.filter(
    t => t.position === 'bottom' && t.type === 'terminal'
  )

  return (
    <>
      {terminalTabs.map((tab) => (
        <Terminal
          key={tab.id}
          ptyId={tab.id}
          directory={directory}
          isActive={tab.id === activeTab.id}
        />
      ))}
    </>
  )
})
