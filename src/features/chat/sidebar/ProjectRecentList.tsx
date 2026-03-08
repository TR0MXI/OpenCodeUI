import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiSession } from '../../../api'
import { ChevronDownIcon, FolderIcon, SpinnerIcon } from '../../../components/Icons'
import { useSessions } from '../../../hooks'
import { useInView } from '../../../hooks/useInView'
import { getDirectoryName, isSameDirectory } from '../../../utils'
import { SessionList } from '../../sessions'

const DIRECTORY_GROUP_PAGE_SIZE = 12
const DIRECTORY_GROUP_MAX_VISIBLE_ITEMS = 6
const DIRECTORY_GROUP_SCROLL_MAX_HEIGHT = DIRECTORY_GROUP_MAX_VISIBLE_ITEMS * 56 + 16
const NOOP = () => {}

export interface DirectoryRecentProject {
  id: string
  name: string
  worktree: string
}

interface ProjectRecentListProps {
  projects: DirectoryRecentProject[]
  currentDirectory?: string
  selectedSessionId: string | null
  onSelectSession: (session: ApiSession) => void
  onRenameSession: (session: ApiSession, newTitle: string) => Promise<void>
  onSessionDeleted: (sessionId: string) => void
}

function getDefaultExpandedProjectIds(projects: DirectoryRecentProject[], currentDirectory?: string): string[] {
  const expanded = new Set<string>()
  const currentProject = currentDirectory
    ? projects.find(project => isSameDirectory(project.worktree, currentDirectory))
    : undefined

  if (currentProject) {
    expanded.add(currentProject.id)
  }

  projects.slice(0, currentProject ? 1 : 2).forEach(project => {
    expanded.add(project.id)
  })

  if (expanded.size === 0 && projects[0]) {
    expanded.add(projects[0].id)
  }

  return Array.from(expanded)
}

export function ProjectRecentList({
  projects,
  currentDirectory,
  selectedSessionId,
  onSelectSession,
  onRenameSession,
  onSessionDeleted,
}: ProjectRecentListProps) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(() =>
    getDefaultExpandedProjectIds(projects, currentDirectory),
  )

  useEffect(() => {
    setExpandedProjectIds(prev => {
      const validIds = prev.filter(id => projects.some(project => project.id === id))
      if (validIds.length === 0) {
        return getDefaultExpandedProjectIds(projects, currentDirectory)
      }

      const next = new Set(validIds)
      if (currentDirectory) {
        const currentProject = projects.find(project => isSameDirectory(project.worktree, currentDirectory))
        if (currentProject) {
          next.add(currentProject.id)
        }
      }
      return Array.from(next)
    })
  }, [projects, currentDirectory])

  const expandedLookup = useMemo(() => new Set(expandedProjectIds), [expandedProjectIds])

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId],
    )
  }, [])

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-2 py-2 space-y-2">
      {projects.map(project => (
        <ProjectRecentSection
          key={project.id}
          project={project}
          isExpanded={expandedLookup.has(project.id)}
          isCurrent={isSameDirectory(project.worktree, currentDirectory)}
          selectedSessionId={selectedSessionId}
          onToggle={() => toggleProject(project.id)}
          onSelectSession={onSelectSession}
          onRenameSession={onRenameSession}
          onSessionDeleted={onSessionDeleted}
        />
      ))}
    </div>
  )
}

interface ProjectRecentSectionProps {
  project: DirectoryRecentProject
  isExpanded: boolean
  isCurrent: boolean
  selectedSessionId: string | null
  onToggle: () => void
  onSelectSession: (session: ApiSession) => void
  onRenameSession: (session: ApiSession, newTitle: string) => Promise<void>
  onSessionDeleted: (sessionId: string) => void
}

function ProjectRecentSection({
  project,
  isExpanded,
  isCurrent,
  selectedSessionId,
  onToggle,
  onSelectSession,
  onRenameSession,
  onSessionDeleted,
}: ProjectRecentSectionProps) {
  const { ref, inView } = useInView({ rootMargin: '160px 0px', triggerOnce: true })
  const shouldLoad = isExpanded && inView

  const { sessions, isLoading, isLoadingMore, hasMore, loadMore, refresh, remove } = useSessions({
    directory: project.worktree,
    pageSize: DIRECTORY_GROUP_PAGE_SIZE,
    enabled: shouldLoad,
  })

  const handleRename = useCallback(
    async (sessionId: string, newTitle: string) => {
      const session = sessions.find(item => item.id === sessionId)
      if (!session) return
      await onRenameSession(session, newTitle)
      await refresh()
    },
    [sessions, onRenameSession, refresh],
  )

  const handleDelete = useCallback(
    async (sessionId: string) => {
      await remove(sessionId)
      onSessionDeleted(sessionId)
    },
    [remove, onSessionDeleted],
  )

  const sectionLabel = useMemo(() => {
    if (isLoading && sessions.length === 0) return 'Loading'
    if (sessions.length === 0) return ''
    return hasMore ? `${sessions.length}+` : `${sessions.length}`
  }, [hasMore, isLoading, sessions.length])

  const projectName = project.name || getDirectoryName(project.worktree) || project.worktree

  return (
    <div ref={ref} className="rounded-xl border border-border-200/50 bg-bg-100/70 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
          isExpanded ? 'bg-bg-200/50' : 'hover:bg-bg-200/40'
        }`}
        title={project.worktree}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
            isCurrent ? 'bg-accent-main-100/15 text-accent-main-100' : 'bg-bg-200 text-text-400'
          }`}
        >
          <FolderIcon size={14} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-text-100 truncate">{projectName}</span>
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-accent-main-100/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-main-100">
                Current
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-400/70 truncate font-mono mt-0.5">{project.worktree}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-text-400">
          {isExpanded && isLoading && sessions.length === 0 ? (
            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" size={14} />
          ) : (
            <span className="min-w-[24px] text-right text-[10px] tabular-nums text-text-400/60">{sectionLabel}</span>
          )}
          <ChevronDownIcon
            size={14}
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <div
        className={`grid transition-all duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="px-1 pb-1">
            {isExpanded && (
              <SessionList
                sessions={sessions}
                selectedId={selectedSessionId}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                search=""
                onSearchChange={NOOP}
                onSelect={onSelectSession}
                onDelete={handleDelete}
                onRename={handleRename}
                onLoadMore={loadMore}
                onNewChat={NOOP}
                showHeader={false}
                grouped={false}
                density="compact"
                showStats
                scrollMaxHeight={DIRECTORY_GROUP_SCROLL_MAX_HEIGHT}
                emptyStateLabel="No chats in this project"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
