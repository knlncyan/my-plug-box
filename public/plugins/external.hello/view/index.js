const STYLE_ID = 'external-hello-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.hello/view/index.css';
  document.head.appendChild(link);
}

export default function ExternalHelloView(props) {
  ensureStyles();

  const React = window.React;
  if (!React) {
    return 'React runtime missing in plugin sandbox';
  }

  const h = React.createElement;
  const useState = React.useState;

  const hint = typeof props?.welcome === 'string' ? props.welcome : 'external plugin';
  const [count, setCount] = useState(0);

  return h(
    'div',
    { className: 'hello-root' },
    h('h2', { className: 'hello-title' }, 'Hello Plugin'),
    h('p', { className: 'hello-sub' }, `Welcome ${hint}`),
    h('p', { className: 'hello-sub' }, `Clicked ${count} times`),
    h(
      'button',
      {
        className: 'hello-btn',
        type: 'button',
        onClick: () => setCount((prev) => prev + 1),
      },
      'Click me'
    )
  );
}
