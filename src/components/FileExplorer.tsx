// ============================================
// FileExplorer - 文件浏览器组件
// 包含文件树和文件预览两个区域，支持拖拽调整高度
// 性能优化：使用 CSS 变量 + requestAnimationFrame 处理 resize
// ============================================

import { memo, useCallback, useMemo, useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useFileExplorer, type FileTreeNode } from '../hooks'
import { layoutStore, type PreviewFile } from '../store/layoutStore'
import { 
  FileIcon, 
  FolderIcon, 
  FolderOpenIcon, 
  ChevronRightIcon, 
  ChevronDownIcon,
  RetryIcon,
  CloseIcon,
  AlertCircleIcon,
} from './Icons'
import { detectLanguage } from '../utils/languageUtils'
import { useSyntaxHighlight } from '../hooks/useSyntaxHighlight'
import type { FileContent } from '../api/types'

// 常量
const MIN_TREE_HEIGHT = 100
const MIN_PREVIEW_HEIGHT = 150
const LINE_HEIGHT = 20 // 每行高度（用于虚拟滚动）
const OVERSCAN = 5 // 额外渲染的行数

interface FileExplorerProps {
  directory?: string
  previewFile: PreviewFile | null
  position?: 'bottom' | 'right'
  isPanelResizing?: boolean
}

export const FileExplorer = memo(function FileExplorer({ 
  directory, 
  previewFile,
  position = 'right',
  isPanelResizing = false,
}: FileExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const [treeHeight, setTreeHeight] = useState<number | null>(null) // null 表示自动
  const [isResizing, setIsResizing] = useState(false)
  const rafRef = useRef<number>(0)
  const currentHeightRef = useRef<number | null>(null)
  
  // 综合 resize 状态 - 外部面板 resize 或内部 resize
  const isAnyResizing = isPanelResizing || isResizing
  
  const {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    selectedPath,
    selectFile,
    previewContent,
    previewLoading,
    previewError,
    loadPreview,
    clearPreview,
    fileStatus,
    refresh,
  } = useFileExplorer({ directory, autoLoad: true })

  // 同步高度到 CSS 变量
  useLayoutEffect(() => {
    if (!isResizing && treeRef.current && treeHeight !== null) {
      treeRef.current.style.setProperty('--tree-height', `${treeHeight}px`)
      currentHeightRef.current = treeHeight
    }
  }, [treeHeight, isResizing])

  // 当 previewFile 改变时加载预览
  useEffect(() => {
    if (previewFile) {
      selectFile(previewFile.path)
      loadPreview(previewFile.path)
    }
  }, [previewFile, selectFile, loadPreview])

  // 处理文件点击
  const handleFileClick = useCallback((node: FileTreeNode) => {
    if (node.type === 'directory') {
      toggleExpand(node.path)
    } else {
      selectFile(node.path)
      loadPreview(node.path)
      layoutStore.openFilePreview({ path: node.path, name: node.name }, position)
    }
  }, [toggleExpand, selectFile, loadPreview, position])

  // 关闭预览
  const handleClosePreview = useCallback(() => {
    clearPreview()
    layoutStore.closeFilePreview()
    setTreeHeight(null)
    currentHeightRef.current = null
  }, [clearPreview])

  // 拖拽调整高度 - 使用 CSS 变量 + requestAnimationFrame 优化
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    
    const container = containerRef.current
    const treeEl = treeRef.current
    if (!container || !treeEl) return
    
    setIsResizing(true)
    
    const containerRect = container.getBoundingClientRect()
    const startY = e.clientY
    const startHeight = currentHeightRef.current ?? containerRect.height * 0.4
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        const deltaY = moveEvent.clientY - startY
        const newHeight = startHeight + deltaY
        const maxHeight = containerRect.height - MIN_PREVIEW_HEIGHT
        const clampedHeight = Math.min(Math.max(newHeight, MIN_TREE_HEIGHT), maxHeight)
        // 直接修改 CSS 变量
        treeEl.style.setProperty('--tree-height', `${clampedHeight}px`)
        currentHeightRef.current = clampedHeight
      })
    }
    
    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // 更新 state 以持久化
      if (currentHeightRef.current !== null) {
        setTreeHeight(currentHeightRef.current)
      }
    }
    
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // 是否显示预览
  const showPreview = previewContent || previewLoading || previewError

  // 没有选择目录
  if (!directory) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2 p-4">
        <FolderIcon size={32} className="opacity-30" />
        <span className="text-center">Select a project to browse files</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* File Tree - 使用 CSS 变量控制高度 */}
      <div 
        ref={treeRef}
        className="overflow-hidden flex flex-col shrink-0"
        style={{ 
          '--tree-height': treeHeight !== null ? `${treeHeight}px` : '40%',
          height: showPreview ? 'var(--tree-height)' : '100%',
          minHeight: showPreview ? MIN_TREE_HEIGHT : undefined,
        } as React.CSSProperties}
      >
        {/* Tree Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-100/50 shrink-0">
          <span className="text-[10px] font-bold text-text-400 uppercase tracking-wider">
            Explorer
          </span>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-200 rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RetryIcon size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {isLoading && tree.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-text-400 text-xs">
              Loading...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-20 text-danger-100 text-xs gap-1 px-4">
              <AlertCircleIcon size={16} />
              <span className="text-center">{error}</span>
            </div>
          ) : tree.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-text-400 text-xs">
              No files found
            </div>
          ) : (
            <div className="py-1">
              {tree.map(node => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  expandedPaths={expandedPaths}
                  selectedPath={selectedPath}
                  fileStatus={fileStatus}
                  onClick={handleFileClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle - 扩大拖拽区域 */}
      {showPreview && (
        <div
          className={`
            h-1.5 cursor-row-resize shrink-0 relative
            hover:bg-accent-main-100/50 transition-all
            ${isResizing ? 'bg-accent-main-100' : 'bg-border-200/50'}
          `}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Preview Area */}
      {showPreview && (
        <div className="flex-1 flex flex-col min-h-0" style={{ minHeight: MIN_PREVIEW_HEIGHT }}>
          <FilePreview
            path={selectedPath}
            content={previewContent}
            isLoading={previewLoading}
            error={previewError}
            onClose={handleClosePreview}
            isResizing={isAnyResizing}
          />
        </div>
      )}
    </div>
  )
})

// ============================================
// File Tree Item
// ============================================

interface FileTreeItemProps {
  node: FileTreeNode
  depth: number
  expandedPaths: Set<string>
  selectedPath: string | null
  fileStatus: Map<string, { status: string }>
  onClick: (node: FileTreeNode) => void
}

const FileTreeItem = memo(function FileTreeItem({
  node,
  depth,
  expandedPaths,
  selectedPath,
  fileStatus,
  onClick,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const status = fileStatus.get(node.path)

  // 状态颜色
  const statusColor = useMemo(() => {
    if (!status) return null
    switch (status.status) {
      case 'added': return 'text-success-100'
      case 'modified': return 'text-warning-100'
      case 'deleted': return 'text-danger-100'
      default: return null
    }
  }, [status])

  return (
    <div>
      <button
        onClick={() => onClick(node)}
        className={`
          w-full flex items-center gap-1 px-2 py-0.5 text-left
          hover:bg-bg-200/50 transition-colors text-[12px]
          ${isSelected ? 'bg-bg-200/70 text-text-100' : 'text-text-300'}
          ${node.ignored ? 'opacity-50' : ''}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand/Collapse Icon */}
        {isDirectory ? (
          <span className="w-4 h-4 flex items-center justify-center text-text-400 shrink-0">
            {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/Folder Icon */}
        <span className={`shrink-0 ${statusColor || 'text-text-400'}`}>
          {isDirectory ? (
            isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />
          ) : (
            <FileIcon size={14} />
          )}
        </span>

        {/* Name */}
        <span className={`truncate flex-1 ${statusColor || ''}`}>
          {node.name}
        </span>

        {/* Loading Indicator */}
        {node.isLoading && (
          <span className="w-3 h-3 border border-text-400 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </button>

      {/* Children */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              fileStatus={fileStatus}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// ============================================
// File Preview
// ============================================

interface FilePreviewProps {
  path: string | null
  content: FileContent | null
  isLoading: boolean
  error: string | null
  onClose: () => void
  isResizing?: boolean
}

function FilePreview({ path, content, isLoading, error, onClose, isResizing = false }: FilePreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // 获取文件名
  const fileName = path?.split(/[/\\]/).pop() || 'Untitled'
  const language = path ? detectLanguage(path) : 'text'

  // 处理 diff 内容
  const displayContent = useMemo(() => {
    if (!content) return null
    
    // 如果有 patch，优先显示 diff
    if (content.patch && content.patch.hunks.length > 0) {
      return {
        type: 'diff' as const,
        hunks: content.patch.hunks,
      }
    }
    
    // 否则显示普通内容
    return {
      type: 'text' as const,
      text: content.content,
    }
  }, [content])

  return (
    <div className="flex flex-col h-full">
      {/* Preview Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-100/50 bg-bg-100/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon size={12} className="text-text-400 shrink-0" />
          <span className="text-[11px] font-mono text-text-200 truncate">{fileName}</span>
          {content?.diff && (
            <span className="text-[9px] px-1.5 py-0.5 bg-warning-100/20 text-warning-100 rounded font-medium shrink-0">
              Modified
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-200 rounded transition-colors shrink-0"
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {/* Preview Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-text-400 text-xs">
            Loading...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-danger-100 text-xs gap-1 px-4">
            <AlertCircleIcon size={16} />
            <span className="text-center">{error}</span>
          </div>
        ) : displayContent?.type === 'diff' ? (
          <DiffPreview hunks={displayContent.hunks} isResizing={isResizing} />
        ) : displayContent?.type === 'text' ? (
          <CodePreview code={displayContent.text} language={language || 'text'} isResizing={isResizing} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-400 text-xs">
            No content
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Diff Preview
// ============================================

interface DiffPreviewProps {
  hunks: Array<{
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: string[]
  }>
  isResizing?: boolean
}

function DiffPreview({ hunks, isResizing = false }: DiffPreviewProps) {
  return (
    <div 
      className={`font-mono text-[11px] leading-relaxed ${isResizing ? 'whitespace-pre overflow-hidden' : ''}`} 
      style={{ contain: 'content' }}
    >
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="border-b border-border-100/30 last:border-0">
          {/* Hunk Header */}
          <div className="px-3 py-1 bg-bg-200/50 text-text-400 text-[10px]">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {/* Lines */}
          <div>
            {hunk.lines.map((line, lineIdx) => {
              const type = line[0]
              let bgClass = ''
              let textClass = 'text-text-300'
              
              if (type === '+') {
                bgClass = 'bg-success-100/10'
                textClass = 'text-success-100'
              } else if (type === '-') {
                bgClass = 'bg-danger-100/10'
                textClass = 'text-danger-100'
              }
              
              return (
                <div key={lineIdx} className={`px-3 py-0.5 ${bgClass} ${textClass}`}>
                  <span className="select-none opacity-50 w-4 inline-block">{type || ' '}</span>
                  <span>{line.slice(1)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Code Preview - Syntax highlighted code display
// 小文件直接渲染支持换行，大文件虚拟滚动
// ============================================

interface CodePreviewProps {
  code: string
  language: string
  isResizing?: boolean
}

// 大文件阈值
const LARGE_FILE_THRESHOLD = 1000

function CodePreview({ code, language, isResizing = false }: CodePreviewProps) {
  const lines = useMemo(() => code.split('\n'), [code])
  const isLargeFile = lines.length >= LARGE_FILE_THRESHOLD
  
  // 大文件用虚拟滚动
  if (isLargeFile) {
    return <VirtualCodePreview code={code} language={language} lines={lines} isResizing={isResizing} />
  }
  
  // 小文件直接渲染
  return <SimpleCodePreview code={code} language={language} lines={lines} isResizing={isResizing} />
}

// 小文件：直接渲染，支持换行
// 在 resize 期间使用缓存的高亮结果，避免重新计算
function SimpleCodePreview({ code, language, lines, isResizing }: { code: string; language: string; lines: string[]; isResizing: boolean }) {
  // text 类型不走高亮，避免 shiki 输出内联黑色样式
  const enableHighlight = language !== 'text' && !isResizing // resize 时禁用高亮
  const { output: html, isLoading } = useSyntaxHighlight(code, { lang: language, enabled: enableHighlight })
  
  // 缓存高亮结果
  const highlightedLinesRef = useRef<string[] | null>(null)
  
  // 解析高亮后的行
  const highlightedLines = useMemo(() => {
    if (isLoading || !html) return highlightedLinesRef.current
    
    const parser = new DOMParser()
    const doc = parser.parseFromString(html as string, 'text/html')
    const lineElements = doc.querySelectorAll('.line')
    
    if (lineElements.length === 0) return highlightedLinesRef.current
    
    const result = Array.from(lineElements).map(el => el.innerHTML || '&nbsp;')
    highlightedLinesRef.current = result
    return result
  }, [html, isLoading])
  
  return (
    <div 
      className={`font-mono text-[11px] leading-relaxed ${isResizing ? 'whitespace-pre overflow-hidden' : ''}`} 
      style={{ contain: 'content' }}
    >
      {lines.map((line, idx) => {
        const highlighted = highlightedLines?.[idx]
        const isHtml = highlighted && highlighted.includes('<')
        
        return (
          <div key={idx} className="flex hover:bg-bg-200/30 py-0.5">
            <span className="select-none text-text-500 w-10 text-right pr-3 shrink-0 border-r border-border-100/30 mr-3">
              {idx + 1}
            </span>
            {isHtml ? (
              <span 
                className={`flex-1 min-w-0 ${isResizing ? '' : 'whitespace-pre-wrap break-all'}`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            ) : (
              <span className={`text-text-200 flex-1 min-w-0 ${isResizing ? '' : 'whitespace-pre-wrap break-all'}`}>
                {highlighted || line || ' '}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 大文件：虚拟滚动
// 在 resize 期间使用缓存的高亮结果，并跳过 ResizeObserver 更新
function VirtualCodePreview({ code, language, lines, isResizing }: { code: string; language: string; lines: string[]; isResizing: boolean }) {
  // text 类型不走高亮，resize 时也禁用以提高性能
  const enableHighlight = language !== 'text' && !isResizing
  const { output: html, isLoading } = useSyntaxHighlight(code, { lang: language, enabled: enableHighlight })
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  
  // 缓存高亮结果
  const highlightedLinesRef = useRef<string[] | null>(null)
  
  const totalHeight = lines.length * LINE_HEIGHT
  
  // 解析高亮后的行
  const highlightedLines = useMemo(() => {
    if (isLoading || !html) return highlightedLinesRef.current
    
    const parser = new DOMParser()
    const doc = parser.parseFromString(html as string, 'text/html')
    const lineElements = doc.querySelectorAll('.line')
    
    if (lineElements.length === 0) return highlightedLinesRef.current
    
    const result = Array.from(lineElements).map(el => el.innerHTML || '&nbsp;')
    highlightedLinesRef.current = result
    return result
  }, [html, isLoading])
  
  // 计算可见范围
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(containerHeight / LINE_HEIGHT)
    const end = Math.min(lines.length, start + visibleCount + OVERSCAN * 2)
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * LINE_HEIGHT,
    }
  }, [scrollTop, containerHeight, lines.length])
  
  // 监听容器大小变化 - resize 时完全跳过
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    // resize 时跳过 ResizeObserver
    if (isResizing) return
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const updateHeight = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setContainerHeight(container.clientHeight)
      }, 50) 
    }
    
    // 初始化立即执行
    setContainerHeight(container.clientHeight)
    
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [isResizing])
  
  // 处理滚动 - resize 时使用 throttle
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!isResizing) {
      setScrollTop(e.currentTarget.scrollTop)
    }
  }, [isResizing])
  
  // 渲染可见行
  const visibleLines = useMemo(() => {
    const result: React.ReactNode[] = []
    
    for (let i = startIndex; i < endIndex; i++) {
      const rawLine = lines[i] || ' '
      const highlighted = highlightedLines?.[i]
      const isHtml = highlighted && highlighted.includes('<')
      
      result.push(
        <div 
          key={i} 
          className="flex hover:bg-bg-200/30"
          style={{ height: LINE_HEIGHT }}
        >
          <span className="select-none text-text-500 w-10 text-right pr-3 shrink-0 border-r border-border-100/30 mr-3 leading-5">
            {i + 1}
          </span>
          {isHtml ? (
            <span 
              className={`leading-5 pr-4 ${isResizing ? 'whitespace-pre overflow-hidden' : 'whitespace-pre'}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <span className={`text-text-200 leading-5 pr-4 ${isResizing ? 'whitespace-pre overflow-hidden' : 'whitespace-pre'}`}>
              {highlighted || rawLine}
            </span>
          )}
        </div>
      )
    }
    return result
  }, [startIndex, endIndex, lines, highlightedLines, isResizing])

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-auto custom-scrollbar relative"
      onScroll={handleScroll}
      style={{ contain: 'strict' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div 
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            transform: `translateY(${offsetY}px)` 
          }}
          className="font-mono text-[11px] leading-relaxed"
        >
          {visibleLines}
        </div>
      </div>
    </div>
  )
}
