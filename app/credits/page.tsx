import { SaviSidebar } from '@/components/SaviSidebar';

const plans = [
  { name: 'Free', price: '£0', credits: '100 credits/month', features: ['Ask SAVI', 'Template previews', 'Starter file tools'] },
  { name: 'Pro', price: '£9', credits: '500 credits/month', features: ['File analysis', 'Audio downloads', 'PDF tools', 'Image tools'] },
  { name: 'Creator', price: '£19', credits: '1500 credits/month', features: ['Podcast workflows', 'Batch tools', 'Advanced templates', 'Priority processing'] }
];

export default function CreditsPage() {
  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Credits" credits={20000} />
      <section className="savi-content-shell mx-auto max-w-7xl px-5 py-24 lg:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-violet-500">Credits & Plans</p>
        <h1 className="mt-4 text-5xl font-black">Usage stays clear.</h1>
        <p className="mt-5 max-w-2xl leading-8 text-slate-600">
          Use SAVI your way. Subscribe monthly or add credits when you need them. Purchased credits never expire.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className="glass rounded-[34px] p-6">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-violet-500">{plan.name}</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-black">{plan.price}</span>
                <span className="pb-2 text-slate-500">/month</span>
              </div>
              <p className="mt-4 rounded-full border border-violet-100 bg-white/70 px-4 py-2 text-sm font-bold text-slate-700">{plan.credits}</p>
              <ul className="mt-6 space-y-3 text-slate-600">
                {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
              </ul>
              <button className="mt-7 w-full rounded-full bg-violet-600 px-5 py-3 font-black text-white hover:bg-violet-700">Choose plan</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
