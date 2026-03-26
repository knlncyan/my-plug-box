const STYLE_ID = 'external-notes-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.notes/view/index.css';
  document.head.appendChild(link);
}

export default function NotesView(props) {
  ensureStyles();
  const tip = typeof props?.tip === 'string' ? props.tip : 'Use notes commands';
  return `Notes Plugin Ready. ${tip}`;
}