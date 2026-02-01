// ============================================
// RightPanel - 右侧面板容器
// 支持多标签、resize、右键菜单移动
// 性能优化：resize 期间使用 CSS visibility:hidden 完全跳过布局计算
// ============================================

import { memo, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { useLayoutStore, layoutStore, type PanelTab } from '../store/layoutStore'
import { PanelContainer } from './PanelContainer'
import { SessionChangesPanel } from './SessionChangesPanel'
import { FileExplorer } from './FileExplorer'
import { Terminal } from './Terminal'
import { useMessageStore } from '../store'
import { useDirectory } from '../hooks'
import { createPtySession, removePtySession } from '../api/pty'
import type { TerminalTab } from '../store/layoutStore'

const MIN_WIDTH = 300
const MAX_WIDTH = 800

export const RightPanel = memo(function RightPanel() {
  const { rightPanelOpen, rightPanelWidth, previewFile } = useLayoutStore()
  const { sessionId } = useMessageStore()
  const { currentDirectory } = useDirectory()
  
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const currentWidthRef = useRef(rightPanelWidth)

  // 同步 store 宽度到 CSS 变量
  useLayoutEffect(() => {
    if (!isResizing && panelRef.current) {
      panelRef.current.style.setProperty('--panel-width', `${rightPanelWidth}px`)
      currentWidthRef.current = rightPanelWidth
    }
  }, [rightPanelWidth, isResizing])

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    
    const panel = panelRef.current
    const content = contentRef.current
    if (!panel || !content) return
    
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    // 立即隐藏内容以跳过布局计算 (display:none 比 visibility:hidden 更彻底)
    window.dispatchEvent(new CustomEvent('panel-resize-start'))
    content.style.display = 'none'
    
    const startX = e.clientX
    const startWidth = currentWidthRef.current
    
    // 使用 requestAnimationFrame 优化 mousemove
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        const deltaX = startX - moveEvent.clientX
        const newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), MAX_WIDTH)
        // 直接修改 CSS 变量，不触发 React 重新渲染
        panel.style.setProperty('--panel-width', `${newWidth}px`)
        currentWidthRef.current = newWidth
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
      layoutStore.setRightPanelWidth(currentWidthRef.current)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // 关闭终端时清理 PTY 会话
  const handleCloseTerminal = useCallback(async (ptyId: string) => {
    try {
      await removePtySession(ptyId, currentDirectory)
    } catch {
      // ignore cleanup errors
    }
  }, [currentDirectory])

  // 创建新终端
  const handleNewTerminal = useCallback(async () => {
    try {
      console.log('[RightPanel] Creating PTY session, directory:', currentDirectory)
      const pty = await createPtySession({ cwd: currentDirectory }, currentDirectory)
      console.log('[RightPanel] PTY created:', pty)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || 'Terminal',
        status: 'connecting',
      }
      // 添加到右侧面板
      layoutStore.addTerminalTab(tab, true, 'right')
    } catch (error) {
      console.error('[RightPanel] Failed to create terminal:', error)
    }
  }, [currentDirectory])

  // 渲染内容
  const renderContent = useCallback((activeTab: PanelTab | null) => {
    if (!activeTab) {
      return (
        <div className="flex items-center justify-center h-full text-text-400 text-xs">
          No content
        </div>
      )
    }

    switch (activeTab.type) {
      case 'files':
        return (
          <FileExplorer 
            directory={currentDirectory}
            previewFile={previewFile}
            position="right"
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
      case 'terminal':
        return (
          <TerminalContent
            activeTab={activeTab}
            directory={currentDirectory}
          />
        )
      default:
        return null
    }
  }, [currentDirectory, previewFile, sessionId, isResizing])

  return (
    <div 
      ref={panelRef}
      style={{ 
        '--panel-width': `${rightPanelWidth}px`,
        width: rightPanelOpen ? 'var(--panel-width)' : 0 
      } as React.CSSProperties}
      className={`
        relative h-full flex flex-col bg-bg-50/50 backdrop-blur-xl
        overflow-hidden
        ${isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]'}
        ${rightPanelOpen ? 'border-l border-border-200/50' : ''}
      `}
    >
      {/* Content Container - 使用 CSS 变量控制宽度 */}
      <div 
        ref={contentRef}
        className="absolute top-0 right-0 bottom-0 flex flex-col" 
        style={{ width: 'var(--panel-width)' }}
      >
        
        {/* Resize Handle - 扩大拖拽区域 */}
        <div
          className={`
            absolute top-0 left-0 bottom-0 w-2 cursor-col-resize z-50
            hover:bg-accent-main-100/50 transition-colors
            ${isResizing ? 'bg-accent-main-100' : 'bg-transparent'}
          `}
          onMouseDown={startResizing}
        />

        {/* Resize 时的遮罩层，防止内容交互影响性能 */}
        {isResizing && (
          <div className="absolute inset-0 z-40 bg-transparent pointer-events-auto" />
        )}

        {/* Panel Container with Tabs */}
        <PanelContainer position="right" onNewTerminal={handleNewTerminal} onCloseTerminal={handleCloseTerminal}>
          {renderContent}
        </PanelContainer>
      </div>
    </div>
  )
})

// ============================================
// Terminal Content - 渲染所有终端实例 (右侧面板)
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
  
  // 获取所有 right 位置的 terminal tabs
  const terminalTabs = panelTabs.filter(
    t => t.position === 'right' && t.type === 'terminal'
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
