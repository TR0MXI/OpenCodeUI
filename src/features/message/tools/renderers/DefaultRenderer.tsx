import { ContentBlock } from '../../../../components'
import { detectLanguage } from '../../../../utils/languageUtils'
import type { ToolRendererProps, ExtractedToolData } from '../types'

// ============================================
// Default Tool Renderer
// 通用的 Input/Output 渲染逻辑
// ============================================

export function DefaultRenderer({ part, data }: ToolRendererProps) {
  const { state, tool } = part
  const isActive = state.status === 'running' || state.status === 'pending'
  
  const hasInput = !!data.input
  const hasError = !!data.error
  const hasOutput = !!(data.files || data.diff || data.output || data.exitCode !== undefined)
  
  // 是否显示 Input block
  const showInput = hasInput || isActive
  // 是否显示 Output block
  const showOutput = hasInput && (hasOutput || hasError || isActive)
  
  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      {showInput && (
        <ContentBlock 
          label="Input"
          content={data.input || ''}
          language={data.inputLang}
          isLoading={isActive && !hasInput}
          loadingText=""
          defaultCollapsed={(data.input?.length || 0) > 1000}
        />
      )}
      
      {/* Output */}
      {showOutput && (
        <OutputBlock 
          tool={tool}
          data={data}
          isActive={isActive}
          hasError={hasError}
          hasOutput={hasOutput}
        />
      )}
    </div>
  )
}

// ============================================
// Output Block
// ============================================

interface OutputBlockProps {
  tool: string
  data: ExtractedToolData
  isActive: boolean
  hasError: boolean
  hasOutput: boolean
}

function OutputBlock({ tool, data, isActive, hasError, hasOutput }: OutputBlockProps) {
  // Error
  if (hasError) {
    return (
      <ContentBlock 
        label="Error"
        content={data.error || ''}
        variant="error"
      />
    )
  }
  
  // Has output
  if (hasOutput) {
    // Multiple files with diff
    if (data.files) {
      return (
        <div className="space-y-3">
          {data.files.map((file, idx) => (
            <ContentBlock 
              key={idx}
              label={formatToolName(tool) + ' Result'}
              filePath={file.filePath}
              diff={file.diff || (file.before !== undefined && file.after !== undefined 
                ? { before: file.before, after: file.after } 
                : undefined)}
              language={detectLanguage(file.filePath)}
            />
          ))}
        </div>
      )
    }
    
    // Single diff
    if (data.diff) {
      return (
        <ContentBlock 
          label="Output"
          filePath={data.filePath}
          diff={data.diff}
          language={data.outputLang}
        />
      )
    }
    
    // Regular output
    return (
      <ContentBlock 
        label="Output"
        content={data.output}
        language={data.outputLang}
        filePath={data.filePath}
        stats={data.exitCode !== undefined ? { exit: data.exitCode } : undefined}
      />
    )
  }
  
  // Loading
  return (
    <ContentBlock 
      label="Output"
      isLoading={isActive}
      loadingText="Running..."
    />
  )
}

// ============================================
// Helpers
// ============================================

function formatToolName(name: string): string {
  if (!name) return 'Tool'
  return name
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
