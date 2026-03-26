const pluginId = 'external.text-tools';

function toWords(input) {
  return String(input ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const plugin = {
  pluginId,
  commands: {
    'external.text-tools.open': (context) => {
      context.api.get('views').activate('external.text-tools.main');
      return pluginId;
    },
    'external.text-tools.wordCount': (_context, input) => {
      const words = toWords(input);
      return { words: words.length, chars: String(input ?? '').length };
    },
    'external.text-tools.slugify': (_context, input) => {
      return slugify(input);
    },
  },
};

export default plugin;