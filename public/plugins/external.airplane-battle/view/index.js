const STYLE_ID = 'external-airplane-battle-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./index.css', import.meta.url).href;
  document.head.appendChild(link);
}

export default function AirportWarView(props) {
  ensureStyles();

  const React = window.React;
  if (!React) {
    return 'React runtime missing in plugin sandbox';
  }

  const h = React.createElement;
  const useEffect = React.useEffect;
  const useRef = React.useRef;
  const useState = React.useState;

  const hostRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposeRuntime = null;
    let disposed = false;

    async function bootstrap() {
      try {
        const runtimeUrl = new URL('./createAirportWarRuntime.js', import.meta.url).href;
        const module = await import(runtimeUrl);
        if (disposed || !hostRef.current) return;
        disposeRuntime = module.mountAirportWar(hostRef.current, props);
      } catch (err) {
        if (!disposed) {
          setError(String(err));
        }
      }
    }

    void bootstrap();

    return () => {
      disposed = true;
      if (typeof disposeRuntime === 'function') {
        disposeRuntime();
      }
    };
  }, []);

  return h(
    'div',
    { className: 'airplane-battle-root' },
    error
      ? h('div', { className: 'airplane-battle-error' }, error)
      : h('div', { className: 'airplane-battle-shell', ref: hostRef })
  );
}
