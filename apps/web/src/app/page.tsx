export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <p className="font-serif text-6xl">
        Cadence<span className="text-cobalt">.</span>
      </p>
      <h1 className="font-serif text-5xl leading-tight">Subscriptions you can actually see.</h1>
      <p className="text-ink-2">
        Project shell. The product screens arrive in later phases. See the{' '}
        <a className="text-cobalt underline underline-offset-4" href="/dev/tokens">
          design tokens
        </a>
        .
      </p>
    </main>
  );
}
