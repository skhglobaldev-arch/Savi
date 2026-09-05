'use client';

export function ResponsePanel({ response }: { response: string }) {
  return (
    <section className="glass min-h-[260px] rounded-[32px] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">Output</p>
          <h2 className="mt-2 text-2xl font-black">AI response</h2>
        </div>
        <button className="rounded-full border border-violet-100 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:text-violet-700">Copy</button>
      </div>
      {response ? (
        <pre className="whitespace-pre-wrap rounded-[24px] border border-violet-100 bg-white/75 p-5 text-sm leading-7 text-slate-700">{response}</pre>
      ) : (
        <div className="flex min-h-[160px] items-center justify-center rounded-[24px] border border-dashed border-violet-200 bg-white/55 text-center text-slate-400">
          Your generated result will appear here.
        </div>
      )}
    </section>
  );
}
