import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { SidePanel } from './sidebar/SidePanel'
import { ProjectDialog } from './ProjectDialog'
import { useDirectory } from '../../hooks'
import { type ApiSession } from '../../api'

const MIN_WIDTH = 240
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280

interface SidebarProps {
  isOpen: boolean
  selectedSessionId: string | null
  onSelectSession: (session: ApiSession) => void
  onNewSession: () => void
  onClose: () => void
}

export const Sidebar = memo(function Sidebar({
  isOpen,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onClose,
}: SidebarProps) {
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const { addDirectory, pathInfo } = useDirectory()
  const [isMobile, setIsMobile] = useState(false)
  
  // Resizable state
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-width')
      return saved ? Math.min(Math.max(parseInt(saved), MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH
    } catch {
      return DEFAULT_WIDTH
    }
  })
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const handleAddProject = useCallback((path: string) => {
    addDirectory(path)
  }, [addDirectory])

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Resize logic
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      // 限制宽度范围
      const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), MAX_WIDTH)
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Save to local storage
      localStorage.setItem('sidebar-width', width.toString())
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, width]) // width dependency needed for saving correct value? actually width in effect is closure...
  // Wait, if I use width in handleMouseUp closure, it will be stale if I don't use ref or dependency.
  // Better use a ref for width or save in a separate effect.
  
  // Save width separately to avoid stale closure issues in event listener
  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem('sidebar-width', width.toString())
    }
  }, [width, isResizing])

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // 移动端遮罩点击
  const handleBackdropClick = useCallback(() => {
    if (isMobile && isOpen) {
      onClose()
    }
  }, [isMobile, isOpen, onClose])

  // 动态样式
  const sidebarStyle = isMobile 
    ? { width: `${DEFAULT_WIDTH}px` } 
    : { width: isOpen ? `${width}px` : '0px' }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity animate-in fade-in duration-200"
          onClick={handleBackdropClick}
        />
      )}

      <div 
        ref={sidebarRef}
        style={sidebarStyle}
        className={`
          flex flex-col h-full bg-bg-50/50 backdrop-blur-xl
          overflow-hidden
          ${isMobile 
            ? `fixed inset-y-0 left-0 z-40 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `relative border-r border-border-200/50 ${isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]'}`
          }
          ${!isOpen && !isMobile ? 'border-none' : ''}
        `}
      >
        <div className="w-full h-full flex flex-col" style={{ width: isMobile ? DEFAULT_WIDTH : width }}>
          <SidePanel
            onNewSession={onNewSession}
            onSelectSession={onSelectSession}
            onCloseMobile={onClose}
            selectedSessionId={selectedSessionId}
            onAddProject={() => setIsProjectDialogOpen(true)}
          />
        </div>

        {/* Resizer Handle (Desktop only) */}
        {!isMobile && isOpen && (
          <div
            className={`
              absolute top-0 right-0 w-1 h-full cursor-col-resize z-50
              hover:bg-accent-main-100/50 transition-colors
              ${isResizing ? 'bg-accent-main-100' : 'bg-transparent'}
            `}
            onMouseDown={startResizing}
          />
        )}
      </div>

      {/* Dialog */}
      <ProjectDialog
        isOpen={isProjectDialogOpen}
        onClose={() => setIsProjectDialogOpen(false)}
        onSelect={handleAddProject}
        initialPath={pathInfo?.home}
      />
    </>
  )
})
