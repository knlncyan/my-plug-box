const pluginId = 'external.notes';

async function readNotes(api) {
  const notes = await api.get('storage').get('notes');
  return Array.isArray(notes) ? notes : [];
}

const plugin = {
  pluginId,
  activate: async (api) => {
    const storage = api.get('storage');
    const snapshot = await storage.get('notes');
    if (!Array.isArray(snapshot)) {
      await storage.set('notes', []);
    }
  },
  commands: {
    'external.notes.open': (context) => {
      context.api.get('views').activate('external.notes.main');
      return pluginId;
    },
    'external.notes.add': async (context, text) => {
      const content = String(text ?? '').trim();
      if (!content) {
        throw new Error('Usage: external.notes.add("your text")');
      }
      const storage = context.api.get('storage');
      const notes = await readNotes(context.api);
      const next = [{ text: content, at: new Date().toISOString() }, ...notes].slice(0, 100);
      await storage.set('notes', next);
      return next.length;
    },
    'external.notes.list': async (context) => {
      return await readNotes(context.api);
    },
    'external.notes.clear': async (context) => {
      await context.api.get('storage').set('notes', []);
      return 'ok';
    },
  },
};

export default plugin;