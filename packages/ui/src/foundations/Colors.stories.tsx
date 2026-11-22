import type { Meta, StoryObj } from '@storybook/react-vite';
import { colors, contrastPairs, contrastRatio, merchantPalette } from '../index';

const meta = {
  title: 'Foundations/Colors',
  parameters: { layout: 'padded' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Object.entries(colors).map(([name, hex]) => (
        <li key={name} className="rounded-card border border-line bg-surface p-3">
          <div
            className="h-12 rounded-xl border border-line"
            style={{ background: hex }}
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-medium">{name}</p>
          <p className="tabular text-sm text-muted">{hex}</p>
        </li>
      ))}
    </ul>
  ),
};

export const MerchantTiles: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-3">
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
  ),
};

export const Contrast: Story = {
  render: () => (
    <table className="w-full max-w-2xl text-left text-sm">
      <caption className="sr-only">Contrast ratio for each token pair</caption>
      <thead className="text-muted">
        <tr>
          <th scope="col" className="py-2 pr-4 font-medium">
            Pair
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Ratio
          </th>
          <th scope="col" className="py-2 font-medium">
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
  ),
};
