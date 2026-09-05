'use client';

export type ToolMode = 'Ask AI' | 'Files' | 'Images' | 'Voice' | 'Video';

const modes: ToolMode[] = ['Ask AI', 'Files', 'Images', 'Voice', 'Video'];

const modeLabels: Record<ToolMode, string> = {
  'Ask AI': 'Ask SAVI',
  Files: 'File tools',
  Images: 'Image tools',
  Voice: 'Voice tools',
  Video: 'Video tools'
};

export function ToolModeSelector({ value, onChange }: { value: ToolMode; onChange: (mode: ToolMode) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`rounded-full border px-4 py-2 text-sm transition ${
            value === mode
              ? 'border-violet-300 bg-violet-600 text-white shadow-[0_18px_35px_rgba(124,58,237,0.2)]'
              : 'border-violet-100 bg-white/70 text-slate-600 hover:border-violet-300 hover:text-violet-800'
          }`}
        >
          {modeLabels[mode]}
        </button>
      ))}
    </div>
  );
}
