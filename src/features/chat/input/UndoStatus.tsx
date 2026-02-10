import { RedoIcon } from '../../../components/Icons'

interface UndoStatusProps {
  canRedo: boolean
  revertSteps: number
  onRedo?: () => void
  onRedoAll?: () => void
}

export function UndoStatus({ canRedo, revertSteps, onRedo, onRedoAll }: UndoStatusProps) {
  return (
    <div style={{
      overflow: 'hidden',
      transition: 'max-height 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out',
      maxHeight: canRedo ? '80px' : '0px',
      opacity: canRedo ? 1 : 0,
    }}>
      <div className="flex items-center justify-center py-2">
        <div 
          style={{
            transition: 'transform 200ms cubic-bezier(0.34, 1.2, 0.64, 1)',
            transform: canRedo ? 'scale(1)' : 'scale(0.95)',
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 backdrop-blur-md border border-amber-500/20 rounded-full"
        >
          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Editing message{revertSteps > 1 ? ` (${revertSteps} undone)` : ''}
          </span>
          <button onClick={onRedo} className="flex items-center gap-1 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 rounded-md transition-colors">
            <RedoIcon />
            <span>Restore</span>
          </button>
          {revertSteps > 1 && (
            <button onClick={onRedoAll} className="flex items-center gap-1 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 rounded-md transition-colors">
              <span>Restore All</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
