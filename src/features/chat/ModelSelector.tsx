/**
 * ModelSelector - 高效模型选择器
 * 风格：极简、开发者工具风格、高密度
 * 适配：统一 Dropdown 体验，响应式宽度
 */

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { ChevronDownIcon, SearchIcon, ThinkingIcon, EyeIcon } from '../../components/Icons'
import type { ModelInfo } from '../../api'
import {
  getModelKey,
  groupModelsByProvider,
  getRecentModels,
  recordModelUsage,
} from '../../utils/modelUtils'

interface ModelSelectorProps {
  models: ModelInfo[]
  selectedModelKey: string | null
  onSelect: (modelKey: string, model: ModelInfo) => void
  isLoading?: boolean
  disabled?: boolean
}

export const ModelSelector = memo(function ModelSelector({
  models,
  selectedModelKey,
  onSelect,
  isLoading = false,
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models
    const query = searchQuery.toLowerCase()
    return models.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      m.family.toLowerCase().includes(query) ||
      m.providerName.toLowerCase().includes(query)
    )
  }, [models, searchQuery])

  // 分组数据
  const { flatList } = useMemo(() => {
    const groups = groupModelsByProvider(filteredModels)
    const recent = searchQuery ? [] : getRecentModels(models, 5)
    
    let flat: Array<{ type: 'header' | 'item', data: any, key: string }> = []
    const addedKeys = new Set<string>()
    
    if (recent.length > 0) {
      flat.push({ type: 'header', data: { name: 'Recent' }, key: 'header-recent' })
      recent.forEach(m => {
        const key = getModelKey(m)
        flat.push({ type: 'item', data: m, key: `recent-${key}` })
        addedKeys.add(key)
      })
    }
    
    groups.forEach(g => {
      const groupModels = g.models.filter(m => !addedKeys.has(getModelKey(m)))
      if (groupModels.length > 0) {
        flat.push({ type: 'header', data: { name: g.providerName }, key: `header-${g.providerId}` })
        groupModels.forEach(m => flat.push({ type: 'item', data: m, key: getModelKey(m) }))
      }
    })
    
    return { flatList: flat }
  }, [filteredModels, models, searchQuery])

  const itemIndices = useMemo(() => {
    return flatList
      .map((item, index) => item.type === 'item' ? index : -1)
      .filter(i => i !== -1)
  }, [flatList])

  const selectedModel = useMemo(() => {
    if (!selectedModelKey) return null
    return models.find(m => getModelKey(m) === selectedModelKey) ?? null
  }, [models, selectedModelKey])

  const displayName = selectedModel?.name || (isLoading ? 'Loading...' : 'Select model')

  const openMenu = useCallback(() => {
    if (disabled || isLoading) return
    setIsOpen(true)
    setSearchQuery('')
    setHighlightedIndex(0)
  }, [disabled, isLoading])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setSearchQuery('')
    triggerRef.current?.focus()
  }, [])

  const handleSelect = useCallback((model: ModelInfo) => {
    const key = getModelKey(model)
    recordModelUsage(model)
    onSelect(key, model)
    closeMenu()
  }, [onSelect, closeMenu])

  useEffect(() => {
    if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeMenu])

  // 滚动逻辑
  useEffect(() => {
    if (!isOpen) return
    const globalIndex = itemIndices[highlightedIndex]
    const el = document.getElementById(`list-item-${globalIndex}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen, itemIndices])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, itemIndices.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        const globalIndex = itemIndices[highlightedIndex]
        const item = flatList[globalIndex]
        if (item && item.type === 'item') {
          handleSelect(item.data)
        }
        break
      case 'Escape':
        e.preventDefault()
        closeMenu()
        break
    }
  }, [itemIndices, flatList, highlightedIndex, handleSelect, closeMenu])

  return (
    <div ref={containerRef} className="relative font-sans">
      <button
        ref={triggerRef}
        onClick={() => isOpen ? closeMenu() : openMenu()}
        disabled={disabled || isLoading}
        className="group flex items-center gap-2 px-2 py-1.5 text-text-200 rounded-md hover:bg-bg-200/50 hover:text-text-100 transition-colors cursor-pointer text-sm"
        title={displayName}
      >
        <span className="font-medium truncate max-w-[240px]">{displayName}</span>
        <div className={`opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={10} />
        </div>
      </button>

      <div 
        className={`absolute top-full left-0 mt-1 w-[85vw] sm:w-[380px] z-50 transition-all duration-200 ease-out origin-top-left ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
        }`}
        onKeyDown={handleKeyDown}
      >
        <div className="bg-bg-000 border border-border-200 shadow-xl rounded-lg overflow-hidden flex flex-col max-h-[600px]">
          {/* Search */}
          <div className="flex items-center px-3 py-2.5 border-b border-border-200/50 flex-shrink-0 bg-bg-000 z-20">
            <SearchIcon className="w-3.5 h-3.5 text-text-400 mr-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search model..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-text-100 placeholder:text-text-400 font-medium"
            />
          </div>

          {/* List */}
          <div ref={listRef} className="overflow-y-auto custom-scrollbar flex-1 relative">
            {flatList.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-text-400">No models found</div>
            ) : (
              <div className="pb-1">
                {flatList.map((item, index) => {
                  if (item.type === 'header') {
                    return (
                      <div key={item.key} className="px-3 py-1.5 mt-1 first:mt-0 text-[10px] font-bold text-text-400 uppercase tracking-wider select-none sticky top-0 bg-bg-000/95 backdrop-blur-md z-10 border-b border-border-100/50 shadow-sm">
                        {item.data.name}
                      </div>
                    )
                  }
                  
                  const model = item.data as ModelInfo
                  const itemKey = getModelKey(model)
                  const isSelected = selectedModelKey === itemKey
                  const isCurrentlyHighlighted = itemIndices[highlightedIndex] === index

                  return (
                    <div key={item.key} className="px-1.5">
                      <div
                        id={`list-item-${index}`}
                        onClick={() => handleSelect(model)}
                        onMouseEnter={() => {
                          const hIndex = itemIndices.indexOf(index)
                          if (hIndex !== -1) setHighlightedIndex(hIndex)
                        }}
                        className={`
                          group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm font-sans transition-colors mt-0.5
                          ${isSelected ? 'bg-accent-main-100/10 text-accent-main-100' : 'text-text-200'}
                          ${isCurrentlyHighlighted && !isSelected ? 'bg-bg-200/60 text-text-100' : ''}
                        `}
                      >
                        {/* Left: Name */}
                        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                          <span className={`truncate font-medium ${isSelected ? 'text-accent-main-100' : 'text-text-100'}`}>
                            {model.name}
                          </span>
                          <div className="flex items-center gap-1.5 opacity-30 group-hover:opacity-60 transition-opacity flex-shrink-0 h-4">
                            {model.supportsReasoning && (
                              <div className="flex items-center justify-center w-3.5" title="Thinking">
                                <ThinkingIcon size={13} />
                              </div>
                            )}
                            {model.supportsImages && (
                              <div className="flex items-center justify-center w-3.5" title="Vision">
                                <EyeIcon size={14} />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Meta Info */}
                        <div className="flex items-center gap-3 text-xs text-text-400 font-mono flex-shrink-0 ml-4">
                          <span className="opacity-40 max-w-[100px] truncate text-right hidden sm:block">
                            {model.providerName}
                          </span>
                          <span className="opacity-40 w-[4ch] text-right">
                            {formatContext(model.contextLimit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

function formatContext(limit: number): string {
  if (!limit) return ''
  const k = Math.round(limit / 1000)
  if (k >= 1000) return `${(k/1000).toFixed(0)}M`
  return `${k}k`
}
