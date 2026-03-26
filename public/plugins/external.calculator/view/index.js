const STYLE_ID = 'external-calculator-view-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/plugins/external.calculator/view/index.css';
  document.head.appendChild(link);
}

function safeEval(expression) {
  const source = String(expression ?? '').trim();
  if (!source) return '';

  const sanitized = source.replace(/[^0-9+\-*/().%\s]/g, '');
  if (!sanitized) return '';

  return String(Function(`"use strict"; return (${sanitized});`)());
}

const BUTTON_ROWS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
  ['C', '%', '^', '+'],
];

export default function CalculatorView(props) {
  ensureStyles();

  const React = window.React;
  if (!React) {
    return 'React runtime missing in plugin sandbox';
  }

  const h = React.createElement;
  const useState = React.useState;

  const welcome = typeof props?.welcome === 'string' ? props.welcome : 'Calculator';
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const append = (token) => {
    setExpr((prev) => `${prev}${token}`);
    setError('');
  };

  const onClear = () => {
    setExpr('');
    setResult('');
    setError('');
  };

  const onBackspace = () => {
    setExpr((prev) => prev.slice(0, -1));
    setError('');
  };

  const onEval = () => {
    try {
      const value = safeEval(expr);
      setResult(value);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  const buttonNodes = BUTTON_ROWS.map((row, rowIndex) =>
    h(
      'div',
      { key: `row-${rowIndex}`, className: 'calc-row' },
      ...row.map((label) =>
        h(
          'button',
          {
            key: label,
            className: 'calc-btn',
            onClick: () => append(label === '^' ? '**' : label),
            type: 'button',
          },
          label
        )
      )
    )
  );

  return h(
    'div',
    { className: 'calc-root' },
    h('h2', { className: 'calc-title' }, welcome),
    h('div', { className: 'calc-screen' }, expr || '0'),
    h('div', { className: 'calc-result' }, result ? `= ${result}` : 'Press = to evaluate'),
    error ? h('div', { className: 'calc-error' }, error) : null,
    ...buttonNodes,
    h(
      'div',
      { className: 'calc-actions' },
      h('button', { className: 'calc-btn calc-wide', onClick: onBackspace, type: 'button' }, 'Back'),
      h('button', { className: 'calc-btn calc-wide', onClick: onClear, type: 'button' }, 'Clear'),
      h('button', { className: 'calc-btn calc-eval', onClick: onEval, type: 'button' }, '=')
    ),
    h(
      'p',
      { className: 'calc-hint' },
      'Tips: You can also run command external.calculator.eval("1 + 2 * 3") in command palette.'
    )
  );
}
