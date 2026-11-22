import type { Metadata } from 'next';
import { colors, contrastPairs, contrastRatio, merchantPalette } from '@cadence/ui';

export const metadata: Metadata = {
  title: 'Design tokens',
  robots: { index: false, follow: false },
};

const swatches = Object.entries(colors);

export default function TokensPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <header>
        <h1 className="font-serif text-5xl">Design tokens</h1>
        <p className="mt-2 text-muted">
          Contrast ratios below are computed from the actual token values, not hand-typed.
        </p>
      </header>

      <section aria-labelledby="colors">
        <h2 id="colors" className="font-serif text-3xl">
          Color
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map(([name, hex]) => (
            <li key={name} className="rounded-card border border-line bg-surface p-3">
              <div
                className="h-14 rounded-xl border border-line"
                style={{ background: hex }}
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-medium">{name}</p>
              <p className="tabular text-sm text-muted">{hex}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="merchant">
        <h2 id="merchant" className="font-serif text-3xl">
          Merchant tiles
        </h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {merchantPalette.map((tile, i) => (
            <li key={tile} className="text-center">
              <span
                className="flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white"
                style={{ background: tile }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="tabular mt-1 block text-xs text-muted">
                {contrastRatio('#FFFFFF', tile).toFixed(2)}:1
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contrast">
        <h2 id="contrast" className="font-serif text-3xl">
          Contrast
        </h2>
        <table className="mt-4 w-full text-left text-sm">
          <caption className="sr-only">Contrast ratio for each token pair</caption>
          <thead className="text-muted">
            <tr>
              <th className="py-2 pr-4 font-medium" scope="col">
                Pair
              </th>
              <th className="py-2 pr-4 font-medium" scope="col">
                Ratio
              </th>
              <th className="py-2 font-medium" scope="col">
                Needs
              </th>
            </tr>
          </thead>
          <tbody>
            {contrastPairs.map((p) => {
              const ratio = contrastRatio(p.fg, p.bg);
              return (
                <tr key={p.name} className="border-t border-divider">
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="tabular py-2 pr-4">{ratio.toFixed(2)}:1</td>
                  <td className="py-2">
                    {ratio >= p.min ? 'Pass' : 'FAIL'} (≥ {p.min}:1)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <figure className="mt-6" aria-labelledby="track-cap" data-testid="track-sample">
          <figcaption id="track-cap" className="text-sm text-muted">
            Rhythm track sample (ADR-004): covered is solid, uncovered is hatched and labeled.
          </figcaption>
          <div className="mt-2 flex h-6 overflow-hidden rounded-full border border-line">
            <div className="w-2/3 bg-covered" data-testid="track-covered" />
            <div className="hatch-uncovered w-1/3" data-testid="track-uncovered" />
          </div>
          <p className="mt-2 text-sm font-medium text-amber-ink">Not covered · $2.89 short</p>
        </figure>
      </section>

      <section aria-labelledby="type">
        <h2 id="type" className="font-serif text-3xl">
          Type
        </h2>
        <p className="mt-4 font-serif text-7xl tabular">$63.20</p>
        <p className="font-serif text-4xl">Subscriptions you can actually see.</p>
        <p className="mt-2 text-base">
          Inter 400: Studio Notes can take up to $9.99 every 30 days.
        </p>
        <p className="text-base font-medium">Inter 500: Coming up</p>
        <p className="text-base font-semibold">Inter 600: Add $2.89 USDC</p>
      </section>

      <section aria-labelledby="shape">
        <h2 id="shape" className="font-serif text-3xl">
          Shape
        </h2>
        <div className="mt-4 space-y-4">
          <div className="rounded-card border border-line bg-surface p-6">
            Card: 24px radius, hairline border, no shadow
          </div>
          <button
            type="button"
            className="h-[58px] w-full rounded-full bg-cobalt px-8 text-base font-semibold text-white sm:w-auto"
          >
            Primary button: 58px pill
          </button>
        </div>
      </section>
    </main>
  );
}
