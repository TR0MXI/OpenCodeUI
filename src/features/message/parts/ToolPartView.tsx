import { memo, useState } from 'react'
import { ChevronDownIcon } from '../../../components/Icons'
import type { ToolPart } from '../../../types/message'
import { 
  getToolIcon, 
  extractToolData, 
  getToolConfig,
  DefaultRenderer,
  TodoRenderer,
  TaskRenderer,
  hasTodos,
} from '../tools'

// ============================================
// ToolPartView
// ============================================

interface ToolPartViewProps {
  part: ToolPart
  isFirst?: boolean
  isLast?: boolean
}

export const ToolPartView = memo(function ToolPartView({ part, isFirst = false, isLast = false }: ToolPartViewProps) {
  const [expanded, setExpanded] = useState(() => {
    return part.state.status === 'running' || part.state.status === 'pending'
  })
  
  const { state, tool: toolName } = part
  const title = state.title || ''
  
  const duration = state.time?.start && state.time?.end 
    ? state.time.end - state.time.start 
    : undefined

  const headerHeightClass = "h-9" 
  const isActive = state.status === 'running' || state.status === 'pending'
  
  const getStatusClasses = () => {
    if (isActive) return 'text-accent-main-100'
    if (state.status === 'error') return 'text-danger-100'
    if (state.status === 'completed') return 'text-text-200 group-hover/header:text-text-100'
    return 'text-text-200 group-hover/header:text-text-100'
  }
  
  const statusClass = getStatusClasses()

  return (
    <div className="group relative flex">
      {/* Timeline Column */}
      <div className="w-10 shrink-0 relative flex flex-col items-center">
        {!isFirst && (
          <div className="absolute top-0 h-1.5 w-px bg-border-300/30" />
        )}
        {!isLast && (
          <div className="absolute top-[30px] bottom-0 w-px bg-border-300/30" />
        )}
        <div className="absolute top-[18px] -translate-y-1/2 z-10">
          <div className={`
            flex items-center justify-center transition-colors duration-200
            ${isActive ? 'text-accent-main-100 animate-pulse-slow' : ''}
            ${state.status === 'error' ? 'text-danger-100' : ''}
            ${state.status === 'completed' ? 'text-text-400 group-hover:text-text-300' : ''} 
          `}>
            {getToolIcon(toolName)}
          </div>
        </div>
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Header */}
        <button
          className={`flex items-center gap-3 w-full text-left px-3 hover:bg-bg-200/50 rounded-lg transition-colors group/header ${headerHeightClass}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <span className={`font-medium text-sm transition-colors ${statusClass}`}>
              {formatToolName(toolName)}
            </span>
            
            {title && (
              <span className="text-xs text-text-400 truncate font-mono opacity-80 max-w-[60%]">
                {title}
              </span>
            )}
          </div>
            
          <div className="flex items-center gap-3 ml-auto shrink-0">
            {duration !== undefined && state.status === 'completed' && (
              <span className="text-[10px] font-mono text-text-500 tabular-nums opacity-60">
                {formatDuration(duration)}
              </span>
            )}
            {isActive && (
              <span className="text-[10px] font-medium text-accent-main-100 animate-pulse-slow">
                Running...
              </span>
            )}
            {state.status === 'error' && (
              <span className="text-[10px] font-medium text-danger-100">
                Failed
              </span>
            )}
            <span className={`text-text-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDownIcon size={12} />
            </span>
          </div>
        </button>

        {/* Body */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}>
          <div className="overflow-hidden">
            <div className="p-3">
              <ToolBody part={part} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================
// ToolBody - 根据工具类型选择渲染器
// ============================================

function ToolBody({ part }: { part: ToolPart }) {
  const { tool } = part
  const lowerTool = tool.toLowerCase()
  const data = extractToolData(part)
  
  // Task 工具：使用专用渲染器
  if (lowerTool === 'task') {
    return <TaskRenderer part={part} data={data} />
  }
  
  // Todo 工具：如果有 todos 数据，使用专用渲染器
  if (lowerTool.includes('todo') && hasTodos(part)) {
    return <TodoRenderer part={part} data={data} />
  }
  
  // 检查是否有自定义渲染器
  const config = getToolConfig(tool)
  if (config?.renderer) {
    const CustomRenderer = config.renderer
    return <CustomRenderer part={part} data={data} />
  }
  
  // 默认渲染器
  return <DefaultRenderer part={part} data={data} />
}

// ============================================
// Helpers
// ============================================

function formatToolName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
