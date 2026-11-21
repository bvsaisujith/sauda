import { APP_NAME } from '@sauda/shared';

export default function App() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <section className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-amber-400">
          Shop manager
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="max-w-xl text-lg text-stone-300">
          Items, stock and voice commands. The app is the product; voice is a second
          front door onto the same operations.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {['Items and prices', 'Stock batches', 'Voice in 22 languages'].map((label) => (
            <div key={label} className="rounded-xl border border-stone-800 bg-stone-900 p-4">
              <p className="text-sm text-stone-400">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
