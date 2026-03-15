'use client'

export type DrawingTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text' | 'select'

interface WhiteboardToolbarProps {
  activeTool: DrawingTool
  activeColor: string
  strokeWidth: number
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: DrawingTool) => void
  onColorChange: (color: string) => void
  onStrokeWidthChange: (width: number) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

const toolButtons: { tool: DrawingTool; label: string; icon: string }[] = [
  { tool: 'pen', label: 'Pen', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
  { tool: 'eraser', label: 'Eraser', icon: 'M5.505 8.505l6.99-6.99a3 3 0 014.243 0l2.747 2.748a3 3 0 010 4.242l-6.99 6.99M5.505 8.505l7.495 7.495m-7.495-7.495L3 11.01a2 2 0 000 2.828l4.172 4.172a2 2 0 002.828 0L12.5 15.5M20 21H8' },
  { tool: 'line', label: 'Line', icon: 'M4 20L20 4' },
  { tool: 'rect', label: 'Rectangle', icon: 'M3 3h18v18H3z' },
  { tool: 'circle', label: 'Circle', icon: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0' },
  { tool: 'text', label: 'Text', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
  { tool: 'select', label: 'Select/Eraser', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' },
]

const strokeWidths = [2, 4, 8]

export function WhiteboardToolbar({
  activeTool,
  activeColor,
  strokeWidth,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onClear,
}: WhiteboardToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-white rounded-xl border border-orange-100 shadow-sm px-2 py-1.5 flex-wrap">
      {/* Drawing tools */}
      {toolButtons.map(({ tool, label, icon }) => (
        <button
          key={tool}
          title={label}
          onClick={() => onToolChange(tool)}
          className={`p-1.5 rounded-lg transition-colors ${
            activeTool === tool
              ? 'bg-orange-100 text-orange-600'
              : 'text-stone-500 hover:bg-stone-100'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </button>
      ))}

      <div className="w-px h-6 bg-stone-200 mx-1" />

      {/* Color picker */}
      <label className="relative cursor-pointer" title="Color">
        <div className="w-6 h-6 rounded-full border-2 border-stone-300" style={{ backgroundColor: activeColor }} />
        <input
          type="color"
          value={activeColor}
          onChange={(e) => onColorChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>

      <div className="w-px h-6 bg-stone-200 mx-1" />

      {/* Stroke width */}
      {strokeWidths.map((w) => (
        <button
          key={w}
          title={`${w}px`}
          onClick={() => onStrokeWidthChange(w)}
          className={`p-1.5 rounded-lg transition-colors ${
            strokeWidth === w
              ? 'bg-orange-100 text-orange-600'
              : 'text-stone-500 hover:bg-stone-100'
          }`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
          </svg>
        </button>
      ))}

      <div className="w-px h-6 bg-stone-200 mx-1" />

      {/* Undo / Redo / Clear */}
      <button
        title="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button
        title="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
      </button>
      <button
        title="Clear"
        onClick={onClear}
        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
