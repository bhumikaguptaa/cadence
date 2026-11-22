import '@fontsource/instrument-serif/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import type { Preview } from '@storybook/react-vite';
import './preview.css';

const preview: Preview = {
  parameters: {
    // Any axe violation fails the story test. Use 'todo' only with a written reason.
    a11y: { test: 'error' },
    layout: 'padded',
    controls: { expanded: true },
  },
};

export default preview;
