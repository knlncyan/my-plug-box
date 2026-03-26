const pluginId = 'external.calculator';

function isDigit(char) {
  return char >= '0' && char <= '9';
}

function tokenize(input) {
  const tokens = [];
  const source = String(input ?? '').trim();
  if (!source) throw new Error('Expression is empty');

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }

    if (isDigit(ch) || ch === '.') {
      let start = i;
      let dotCount = ch === '.' ? 1 : 0;
      i += 1;
      while (i < source.length) {
        const c = source[i];
        if (isDigit(c)) {
          i += 1;
          continue;
        }
        if (c === '.') {
          dotCount += 1;
          if (dotCount > 1) throw new Error('Invalid number format');
          i += 1;
          continue;
        }
        break;
      }
      const value = Number(source.slice(start, i));
      if (!Number.isFinite(value)) throw new Error('Invalid number');
      tokens.push({ type: 'number', value });
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }

    if ('+-*/%^'.includes(ch)) {
      const prev = tokens[tokens.length - 1];
      const unary =
        (ch === '+' || ch === '-') &&
        (!prev || prev.type === 'op' || prev.type === '(');
      tokens.push({ type: 'op', value: unary ? `u${ch}` : ch });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported token: ${ch}`);
  }

  return tokens;
}

function toRpn(tokens) {
  const out = [];
  const stack = [];
  const precedence = {
    'u+': 4,
    'u-': 4,
    '^': 3,
    '*': 2,
    '/': 2,
    '%': 2,
    '+': 1,
    '-': 1,
  };
  const rightAssoc = new Set(['^', 'u+', 'u-']);

  for (const token of tokens) {
    if (token.type === 'number') {
      out.push(token);
      continue;
    }

    if (token.type === 'op') {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type !== 'op') break;

        const p1 = precedence[token.value] ?? 0;
        const p2 = precedence[top.value] ?? 0;
        const shouldPop = rightAssoc.has(token.value) ? p1 < p2 : p1 <= p2;
        if (!shouldPop) break;
        out.push(stack.pop());
      }
      stack.push(token);
      continue;
    }

    if (token.type === '(') {
      stack.push(token);
      continue;
    }

    if (token.type === ')') {
      let foundLeft = false;
      while (stack.length > 0) {
        const top = stack.pop();
        if (top.type === '(') {
          foundLeft = true;
          break;
        }
        out.push(top);
      }
      if (!foundLeft) throw new Error('Mismatched parentheses');
      continue;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top.type === '(' || top.type === ')') {
      throw new Error('Mismatched parentheses');
    }
    out.push(top);
  }

  return out;
}

function evalRpn(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type !== 'op') throw new Error('Unexpected token in RPN');

    if (token.value === 'u+' || token.value === 'u-') {
      if (stack.length < 1) throw new Error('Invalid expression');
      const a = stack.pop();
      stack.push(token.value === 'u-' ? -a : a);
      continue;
    }

    if (stack.length < 2) throw new Error('Invalid expression');
    const b = stack.pop();
    const a = stack.pop();

    switch (token.value) {
      case '+':
        stack.push(a + b);
        break;
      case '-':
        stack.push(a - b);
        break;
      case '*':
        stack.push(a * b);
        break;
      case '/':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a / b);
        break;
      case '%':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a % b);
        break;
      case '^':
        stack.push(a ** b);
        break;
      default:
        throw new Error(`Unknown operator: ${token.value}`);
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error('Invalid expression result');
  }

  return stack[0];
}

function evaluateExpression(expression) {
  const tokens = tokenize(expression);
  const rpn = toRpn(tokens);
  return evalRpn(rpn);
}

async function ensureDefaults(api) {
  const settings = api.get('settings');
  const storage = api.get('storage');

  const precision = await settings.get('precision');
  if (precision === undefined) {
    await settings.set('precision', 6);
  }

  const history = await storage.get('history');
  if (!Array.isArray(history)) {
    await storage.set('history', []);
  }
}

const plugin = {
  pluginId,
  activate: async (api) => {
    await ensureDefaults(api);
    console.info('[external.calculator] activated');
  },
  deactivate: () => {
    console.info('[external.calculator] deactivated');
  },
  commands: {
    'external.calculator.open': (context) => {
      context.api.get('views').activate('external.calculator.main');
      return pluginId;
    },
    'external.calculator.eval': async (context, expression) => {
      const source = String(expression ?? '').trim();
      if (!source) {
        throw new Error('Usage: external.calculator.eval("1 + 2 * 3")');
      }

      const settings = context.api.get('settings');
      const storage = context.api.get('storage');
      const events = context.api.get('events');

      const precisionRaw = await settings.get('precision');
      const precision = Number.isInteger(precisionRaw) ? Math.min(Math.max(precisionRaw, 0), 12) : 6;

      const value = evaluateExpression(source);
      const result = Number(value.toFixed(precision));

      const history = (await storage.get('history')) ?? [];
      const nextHistory = [
        { expression: source, result, at: new Date().toISOString() },
        ...history,
      ].slice(0, 50);

      await storage.set('history', nextHistory);
      events.emit('external.calculator.updated', {
        expression: source,
        result,
        historySize: nextHistory.length,
      });

      return result;
    },
    'external.calculator.clearHistory': async (context) => {
      await context.api.get('storage').set('history', []);
      return 'ok';
    },
  },
};

export default plugin;