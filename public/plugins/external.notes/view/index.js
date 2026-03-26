const STYLE_ID = 'external-notes-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.notes/view/index.css';
  document.head.appendChild(link);
}

function callRuntime(action, payload, timeoutMs = 10000) {
  const requestId = `notes:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const message = {
    type: 'plugin-view-runtime-request',
    requestId,
    action,
    payload,
  };

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`runtime bridge timeout: ${action}`));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    }

    function onMessage(event) {
      const data = event.data;
      if (!data || data.type !== 'plugin-view-runtime-response' || data.requestId !== requestId) {
        return;
      }

      cleanup();
      if (data.success === true) {
        resolve(data.result);
      } else {
        reject(new Error(String(data.error || 'runtime bridge request failed')));
      }
    }

    window.addEventListener('message', onMessage);
    window.parent.postMessage(message, '*');
  });
}

async function executeCommand(commandId, args = []) {
  return callRuntime('executeCommand', { commandId, args });
}

function normalizeNotes(value) {
  return Array.isArray(value) ? value : [];
}

function formatTime(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }
  return date.toLocaleString();
}

export default function NotesView(props) {
  ensureStyles();

  const React = window.React;
  if (!React) {
    return 'React runtime missing in plugin sandbox';
  }

  const h = React.createElement;
  const useEffect = React.useEffect;
  const useState = React.useState;

  const tip = typeof props?.tip === 'string' ? props.tip : 'Use notes commands';
  const [input, setInput] = useState('');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadNotes() {
    const list = await executeCommand('external.notes.list');
    setNotes(normalizeNotes(list));
  }

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      try {
        setLoading(true);
        setError('');
        const list = await executeCommand('external.notes.list');
        if (!disposed) {
          setNotes(normalizeNotes(list));
        }
      } catch (err) {
        if (!disposed) {
          setError(String(err));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      disposed = true;
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const text = String(input || '').trim();
    if (!text) {
      setError('请输入 note 内容');
      return;
    }

    try {
      setBusy(true);
      setError('');
      await executeCommand('external.notes.add', [text]);
      setInput('');
      await loadNotes();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    try {
      setBusy(true);
      setError('');
      await executeCommand('external.notes.clear');
      await loadNotes();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return h(
    'div',
    { className: 'notes-root' },
    h('h2', { className: 'notes-title' }, 'Notes'),
    h('p', { className: 'notes-tip' }, tip),
    h(
      'form',
      { className: 'notes-form', onSubmit },
      h('input', {
        className: 'notes-input',
        value: input,
        onChange: (event) => setInput(event.target.value),
        placeholder: '输入你的 note...',
        disabled: busy,
      }),
      h(
        'button',
        {
          className: 'notes-btn notes-btn-primary',
          type: 'submit',
          disabled: busy,
        },
        busy ? '保存中...' : '添加'
      ),
      h(
        'button',
        {
          className: 'notes-btn',
          type: 'button',
          onClick: () => void onClear(),
          disabled: busy,
        },
        '清空'
      )
    ),
    error ? h('div', { className: 'notes-error' }, error) : null,
    loading
      ? h('div', { className: 'notes-empty' }, '加载中...')
      : notes.length === 0
      ? h('div', { className: 'notes-empty' }, '暂无 note')
      : h(
          'ul',
          { className: 'notes-list' },
          ...notes.map((item, index) => {
            const text = typeof item?.text === 'string' ? item.text : String(item?.text ?? '');
            const at = formatTime(item?.at);
            return h(
              'li',
              { className: 'notes-item', key: `${at}:${index}` },
              h('div', { className: 'notes-item-text' }, text),
              h('div', { className: 'notes-item-time' }, at)
            );
          })
        )
  );
}
