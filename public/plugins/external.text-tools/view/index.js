const STYLE_ID = 'external-text-tools-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.text-tools/view/index.css';
  document.head.appendChild(link);
}

let pluginApiPromise = null;

async function createPluginApi() {
  if (pluginApiPromise) {
    return pluginApiPromise;
  }

  const factory = window.__MODUDESK_API_FACTORY__;
  if (typeof factory === 'function') {
    pluginApiPromise = factory();
    return pluginApiPromise;
  }

  if (window.__PLUG_BOX_API__) {
    pluginApiPromise = Promise.resolve(window.__PLUG_BOX_API__);
    return pluginApiPromise;
  }

  throw new Error('[plugin-view] plugin api factory not found');
}

async function executeCommand(commandId, args = []) {
  const api = await createPluginApi();
  return api.get('commands').execute(commandId, ...args);
}

export default function TextToolsView(props) {
  ensureStyles();

  const React = window.React;
  if (!React) {
    return 'React runtime missing in plugin sandbox';
  }

  const h = React.createElement;
  const useState = React.useState;

  const welcome = typeof props?.welcome === 'string' ? props.welcome : 'Text Tools';
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function runWordCount() {
    try {
      setBusy(true);
      setError('');
      const data = await executeCommand('external.text-tools.wordCount', [text]);
      const words = Number(data?.words ?? 0);
      const chars = Number(data?.chars ?? 0);
      setResult(`Words: ${words} | Chars: ${chars}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runSlugify() {
    try {
      setBusy(true);
      setError('');
      const data = await executeCommand('external.text-tools.slugify', [text]);
      setResult(`Slug: ${String(data ?? '')}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return h(
    'div',
    { className: 'text-tools-root' },
    h('h2', { className: 'text-tools-title' }, welcome),
    h('textarea', {
      className: 'text-tools-input',
      value: text,
      onChange: (event) => setText(event.target.value),
      placeholder: 'Type some text...',
      rows: 6,
      disabled: busy,
    }),
    h(
      'div',
      { className: 'text-tools-actions' },
      h(
        'button',
        {
          className: 'text-tools-btn text-tools-btn-primary',
          type: 'button',
          onClick: () => void runWordCount(),
          disabled: busy,
        },
        'Word Count'
      ),
      h(
        'button',
        {
          className: 'text-tools-btn',
          type: 'button',
          onClick: () => void runSlugify(),
          disabled: busy,
        },
        'Slugify'
      )
    ),
    error ? h('div', { className: 'text-tools-error' }, error) : null,
    result ? h('div', { className: 'text-tools-result' }, result) : null
  );
}
