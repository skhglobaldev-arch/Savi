'use client';

const items = [
  'PDF summary template opened',
  'Ask SAVI response generated',
  'Credits check completed',
  'Image prompt template ready'
];

export function RecentActivity() {
  return (
    <section className="glass rounded-[32px] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">Recent activity</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-violet-100 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
