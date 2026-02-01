/**
 * DiffViewer - 核心 Diff 渲染组件
 * 性能优化：在 resize 期间跳过词级别 diff 计算，使用缓存结果
 */

import { memo, useMemo, useRef } from 'react'
import { diffLines, diffWords } from 'diff'

// ============================================
// Types
// ============================================

export type ViewMode = 'split' | 'unified'

export interface DiffViewerProps {
  before: string
  after: string
  language?: string
  viewMode?: ViewMode
  isResizing?: boolean
}

export type LineType = 'add' | 'delete' | 'context' | 'empty'

interface DiffLine {
  type: LineType
  content: string
  lineNo?: number
  highlightedContent?: string
}

interface PairedLine {
  left: DiffLine
  right: DiffLine
}

interface UnifiedLine extends DiffLine {
  oldLineNo?: number
  newLineNo?: number
}

// ============================================
// Main Component
// ============================================

export const DiffViewer = memo(function DiffViewer({
  before,
  after,
  viewMode = 'split',
  isResizing = false,
}: DiffViewerProps) {
  return (
    <div className="flex-1 overflow-auto custom-scrollbar font-mono text-[13px] leading-6" style={{ contain: 'content' }}>
      {viewMode === 'split' ? (
        <SplitDiffView before={before} after={after} isResizing={isResizing} />
      ) : (
        <UnifiedDiffView before={before} after={after} isResizing={isResizing} />
      )}
    </div>
  )
})

// ============================================
// Split Diff View
// ============================================

const SplitDiffView = memo(function SplitDiffView({ before, after, isResizing }: { before: string, after: string, isResizing: boolean }) {
  // 缓存计算结果
  const cachedRef = useRef<PairedLine[] | null>(null)
  
  const pairedLines = useMemo(() => {
    // resize 时使用缓存
    if (isResizing && cachedRef.current) {
      return cachedRef.current
    }
    const result = computePairedLines(before, after, isResizing)
    cachedRef.current = result
    return result
  }, [before, after, isResizing])

  if (pairedLines.length === 0) {
    return <div className="p-8 text-text-400 text-sm text-center">No changes</div>
  }

  return (
    <div className="flex min-h-full w-full">
      {/* Left panel */}
      <div className="flex-1 border-r border-border-100 min-w-0">
        {pairedLines.map((pair, idx) => (
          <div
            key={idx}
            className={`flex ${getLineBgClass(pair.left.type)}`}
          >
            <div className="w-12 shrink-0 px-2 text-right text-text-500 select-none opacity-60">
              {pair.left.lineNo}
            </div>
            <div className={`flex-1 px-3 min-w-0 ${isResizing ? 'whitespace-pre overflow-hidden' : 'whitespace-pre-wrap break-all'}`}>
              {pair.left.type === 'delete' && (
                <span className="text-danger-100 select-none mr-1 inline-block w-3">−</span>
              )}
              {pair.left.type !== 'empty' && (
                <span 
                  className="text-text-100"
                  dangerouslySetInnerHTML={{ __html: pair.left.highlightedContent || escapeHtml(pair.left.content) }} 
                />
              )}
              {pair.left.type === 'empty' && <span>&nbsp;</span>}
            </div>
          </div>
        ))}
      </div>
      
      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {pairedLines.map((pair, idx) => (
          <div
            key={idx}
            className={`flex ${getLineBgClass(pair.right.type)}`}
          >
            <div className="w-12 shrink-0 px-2 text-right text-text-500 select-none opacity-60">
              {pair.right.lineNo}
            </div>
            <div className={`flex-1 px-3 min-w-0 ${isResizing ? 'whitespace-pre overflow-hidden' : 'whitespace-pre-wrap break-all'}`}>
              {pair.right.type === 'add' && (
                <span className="text-success-100 select-none mr-1 inline-block w-3">+</span>
              )}
              {pair.right.type !== 'empty' && (
                <span 
                  className="text-text-100"
                  dangerouslySetInnerHTML={{ __html: pair.right.highlightedContent || escapeHtml(pair.right.content) }} 
                />
              )}
              {pair.right.type === 'empty' && <span>&nbsp;</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

// ============================================
// Unified Diff View
// ============================================

const UnifiedDiffView = memo(function UnifiedDiffView({ before, after, isResizing }: { before: string, after: string, isResizing: boolean }) {
  // 缓存计算结果
  const cachedRef = useRef<UnifiedLine[] | null>(null)
  
  const lines = useMemo(() => {
    // resize 时使用缓存
    if (isResizing && cachedRef.current) {
      return cachedRef.current
    }
    const result = computeUnifiedLines(before, after)
    cachedRef.current = result
    return result
  }, [before, after, isResizing])

  if (lines.length === 0) {
    return <div className="p-8 text-text-400 text-sm text-center">No changes</div>
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`flex ${getLineBgClass(line.type)}`}
        >
          <div className="w-12 shrink-0 px-2 text-right text-text-500 select-none opacity-60">
            {line.oldLineNo}
          </div>
          <div className="w-12 shrink-0 px-2 text-right text-text-500 select-none opacity-60">
            {line.newLineNo}
          </div>
          <div className={`flex-1 px-3 min-w-0 ${isResizing ? 'whitespace-pre overflow-hidden' : 'whitespace-pre-wrap break-all'}`}>
            {line.type === 'add' && (
              <span className="text-success-100 select-none mr-1 inline-block w-3">+</span>
            )}
            {line.type === 'delete' && (
              <span className="text-danger-100 select-none mr-1 inline-block w-3">−</span>
            )}
            <span 
              className="text-text-100"
              dangerouslySetInnerHTML={{ __html: line.highlightedContent || escapeHtml(line.content) }} 
            />
          </div>
        </div>
      ))}
    </div>
  )
})

// ============================================
// Helpers
// ============================================

function getLineBgClass(type: LineType): string {
  switch (type) {
    case 'add': return 'bg-success-bg/40'
    case 'delete': return 'bg-danger-bg/40'
    case 'empty': return 'bg-bg-100/30'
    default: return ''
  }
}

function computePairedLines(before: string, after: string, skipWordDiff: boolean = false): PairedLine[] {
  const changes = diffLines(before, after)
  const result: PairedLine[] = []
  
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  
  let oldIdx = 0
  let newIdx = 0
  let i = 0
  
  while (i < changes.length) {
    const change = changes[i]
    const count = change.count || 0
    
    if (change.removed) {
      const next = changes[i + 1]
      if (next && next.added) {
        const addCount = next.count || 0
        const maxCount = Math.max(count, addCount)
        
        for (let j = 0; j < maxCount; j++) {
          const oldLine = j < count ? beforeLines[oldIdx + j] : undefined
          const newLine = j < addCount ? afterLines[newIdx + j] : undefined
          
          let leftHighlight: string | undefined
          let rightHighlight: string | undefined
          
          // resize 时跳过词级别 diff 计算以提高性能
          if (!skipWordDiff && oldLine !== undefined && newLine !== undefined) {
             const wordDiff = computeWordDiff(oldLine, newLine)
             if (!isTooFragmented(wordDiff.changes)) {
               leftHighlight = wordDiff.left
               rightHighlight = wordDiff.right
             }
          }
          
          result.push({
            left: oldLine !== undefined 
              ? { type: 'delete', content: oldLine, lineNo: oldIdx + j + 1, highlightedContent: leftHighlight }
              : { type: 'empty', content: '' },
            right: newLine !== undefined
              ? { type: 'add', content: newLine, lineNo: newIdx + j + 1, highlightedContent: rightHighlight }
              : { type: 'empty', content: '' },
          })
        }
        
        oldIdx += count
        newIdx += addCount
        i += 2
        continue
      }
      
      for (let j = 0; j < count; j++) {
        result.push({
          left: { type: 'delete', content: beforeLines[oldIdx + j] || '', lineNo: oldIdx + j + 1 },
          right: { type: 'empty', content: '' },
        })
      }
      oldIdx += count
      
    } else if (change.added) {
      for (let j = 0; j < count; j++) {
        result.push({
          left: { type: 'empty', content: '' },
          right: { type: 'add', content: afterLines[newIdx + j] || '', lineNo: newIdx + j + 1 },
        })
      }
      newIdx += count
      
    } else {
      for (let j = 0; j < count; j++) {
        result.push({
          left: { type: 'context', content: beforeLines[oldIdx + j] || '', lineNo: oldIdx + j + 1 },
          right: { type: 'context', content: afterLines[newIdx + j] || '', lineNo: newIdx + j + 1 },
        })
      }
      oldIdx += count
      newIdx += count
    }
    
    i++
  }
  
  return result
}

function isTooFragmented(changes: any[]): boolean {
  let commonLength = 0
  let totalLength = 0
  
  for (const change of changes) {
    totalLength += change.value.length
    if (!change.added && !change.removed) {
      commonLength += change.value.length
    }
  }
  
  if (totalLength > 10 && commonLength / totalLength < 0.4) {
    return true
  }
  
  return false
}

function computeUnifiedLines(before: string, after: string): UnifiedLine[] {
  const changes = diffLines(before, after)
  const result: UnifiedLine[] = []
  
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  
  let oldIdx = 0
  let newIdx = 0
  
  for (const change of changes) {
    const count = change.count || 0
    
    if (change.removed) {
      for (let j = 0; j < count; j++) {
        result.push({
          type: 'delete',
          content: beforeLines[oldIdx + j] || '',
          oldLineNo: oldIdx + j + 1,
        })
      }
      oldIdx += count
    } else if (change.added) {
      for (let j = 0; j < count; j++) {
        result.push({
          type: 'add',
          content: afterLines[newIdx + j] || '',
          newLineNo: newIdx + j + 1,
        })
      }
      newIdx += count
    } else {
      for (let j = 0; j < count; j++) {
        result.push({
          type: 'context',
          content: afterLines[newIdx + j] || '',
          oldLineNo: oldIdx + j + 1,
          newLineNo: newIdx + j + 1,
        })
      }
      oldIdx += count
      newIdx += count
    }
  }
  
  return result
}

function computeWordDiff(oldLine: string, newLine: string): { left: string; right: string; changes: any[] } {
  const changes = diffWords(oldLine, newLine)
  
  const mergedChanges = []
  for (let i = 0; i < changes.length; i++) {
    const current = changes[i]
    const prev = mergedChanges.length > 0 ? mergedChanges[mergedChanges.length - 1] : null
    
    if (prev && !current.added && !current.removed && /^\s*$/.test(current.value)) {
       const next = i + 1 < changes.length ? changes[i + 1] : null
       if (prev.removed && next && next.removed) {
         prev.value += current.value
         continue 
       }
       if (prev.added && next && next.added) {
         prev.value += current.value
         continue
       }
    }
    
    if (prev && ((prev.added && current.added) || (prev.removed && current.removed))) {
      prev.value += current.value
    } else {
      mergedChanges.push({...current}) 
    }
  }

  let left = ''
  let right = ''
  
  for (const change of mergedChanges) {
    const escaped = escapeHtml(change.value)
    
    if (change.removed) {
      left += `<span class="bg-danger-100/30">${escaped}</span>`
    } else if (change.added) {
      right += `<span class="bg-success-100/30">${escaped}</span>`
    } else {
      left += escaped
      right += escaped
    }
  }
  
  return { left, right, changes: mergedChanges }
}

export function extractContentFromUnifiedDiff(diff: string): { before: string, after: string } {
  let before = '', after = ''
  const lines = diff.split('\n')
  
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || 
        line.startsWith('Index:') || line.startsWith('===') ||
        line.startsWith('@@') || line.startsWith('\\ No newline')) {
      continue
    }
    if (line.startsWith('-')) {
      before += line.slice(1) + '\n'
    } else if (line.startsWith('+')) {
      after += line.slice(1) + '\n'
    } else if (line.startsWith(' ')) {
      before += line.slice(1) + '\n'
      after += line.slice(1) + '\n'
    }
  }
  
  return { before: before.trimEnd(), after: after.trimEnd() }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
