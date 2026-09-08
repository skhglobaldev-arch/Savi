import Link from 'next/link';

export default function BillingReturnPage({ searchParams }: { searchParams: { checkout?: string } }) {
  const cancelled = searchParams.checkout === 'cancelled';

  return (
    <main className="savi-app-home min-h-screen bg-black px-5 py-24 text-white">
      <section className="mx-auto max-w-xl glass rounded-[34px] p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/80">Billing</p>
        <h1 className="mt-4 text-4xl font-black">{cancelled ? 'Checkout cancelled' : 'Payment received'}</h1>
        <p className="mt-5 leading-7 text-white/70">
          {cancelled
            ? 'No credits were added. You can return to Credits whenever you are ready.'
            : 'Stripe is confirming the payment. Credits and subscription access appear after SAVI receives and verifies the webhook.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/credits" className="rounded-full bg-white px-5 py-3 font-bold text-black">Open credits</Link>
          <Link href="/settings" className="rounded-full border border-white/20 px-5 py-3 font-bold text-white">Open settings</Link>
        </div>
      </section>
    </main>
  );
}
