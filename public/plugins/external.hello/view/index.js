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
  const hint = typeof props?.welcome === 'string' ? props.welcome : 'external plugin';
  return `External Hello View (${hint})`;
}
