const STYLE_ID = 'external-text-tools-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.text-tools/view/index.css';
  document.head.appendChild(link);
}

export default function TextToolsView(props) {
  ensureStyles();
  const welcome = typeof props?.welcome === 'string' ? props.welcome : 'Text Tools';
  return `${welcome}: try commands external.text-tools.wordCount(...) and external.text-tools.slugify(...)`;
}