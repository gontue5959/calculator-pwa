// ── State ──
let expression = '';   // 內部計算用
let displayExpr = '';  // 顯示用（美化符號）
let freshResult = false;
let lastAnswer = null;
let parenDepth = 0;
let repeatOp = null;    // 連按 = 用：{ op: '+', val: 3 }
let repeatExpr = null;  // 連按 = 顯示用：'+3'

const $result = document.getElementById('result');
const $expr   = document.getElementById('expression');

// ── Display ──
function updateDisplay() {
  const show = addThousandSep(displayExpr) || '0';
  $result.textContent = show;
  $expr.textContent = '';
  autoFit();
}

// 把算式中的數字加千分位，保留運算符和函數名不動
function addThousandSep(str) {
  if (!str) return str;
  // 匹配連續數字（可含小數點），加千分位
  return str.replace(/\d+(\.\d+)?/g, (m) => {
    const parts = m.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  });
}

function autoFit() {
  const container = $result.parentElement;
  const maxW = container.clientWidth - 40;
  if (maxW <= 0) return; // DOM not ready
  const maxSize = 80;
  const minSize = 16;
  let size = maxSize;
  $result.style.fontSize = size + 'px';
  while ($result.scrollWidth > maxW && size > minSize) {
    size -= 2;
    $result.style.fontSize = size + 'px';
  }
}

function formatNum(n) {
  if (typeof n !== 'number') return String(n);
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-10 && n !== 0)) return n.toExponential(6);
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  // 小數也加千分位
  const s = parseFloat(n.toPrecision(10)).toString();
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// ── Expression Parser ──
// 優先順序：+ - < * / < ^ < unary < func < () < number
function evalExpr(expr) {
  expr = expr.replace(/\s/g, '');
  if (!expr) return null;
  // 隱式乘號：)( )(num) (num)( 數字func
  expr = expr.replace(/\)(\(|[0-9]|sqrt|sqr|inv)/g, ')*$1');
  expr = expr.replace(/([0-9.])(\(|sqrt|sqr|inv)/g, '$1*$2');
  const st = { pos: 0 };
  const result = parseAddSub(expr, st);
  return result;
}

function parseAddSub(s, st) {
  let left = parseMulDiv(s, st);
  while (st.pos < s.length && (s[st.pos] === '+' || s[st.pos] === '-')) {
    const op = s[st.pos++];
    const right = parseMulDiv(s, st);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseMulDiv(s, st) {
  let left = parsePow(s, st);
  while (st.pos < s.length && (s[st.pos] === '*' || s[st.pos] === '/')) {
    const op = s[st.pos++];
    const right = parsePow(s, st);
    left = op === '*' ? left * right : (right === 0 ? NaN : left / right);
  }
  return left;
}

function parsePow(s, st) {
  const base = parseUnary(s, st);
  if (st.pos < s.length && s[st.pos] === '^') {
    st.pos++;
    const exp = parsePow(s, st); // right-associative: 2^3^2 = 2^(3^2) = 512
    return Math.pow(base, exp);
  }
  return base;
}

function parseUnary(s, st) {
  if (s[st.pos] === '-') { st.pos++; return -parseUnary(s, st); }
  if (s[st.pos] === '+') { st.pos++; return parseUnary(s, st); }
  return parseFunc(s, st);
}

function parseFunc(s, st) {
  for (const fn of ['sqrt', 'sqr', 'inv']) {
    if (s.startsWith(fn + '(', st.pos)) {
      st.pos += fn.length;
      const arg = parseParen(s, st);
      if (fn === 'sqrt') return Math.sqrt(arg);
      if (fn === 'sqr')  return arg * arg;
      if (fn === 'inv')  return arg === 0 ? NaN : 1 / arg;
    }
  }
  return parseParen(s, st);
}

function parseParen(s, st) {
  if (s[st.pos] === '(') {
    st.pos++;
    const val = parseAddSub(s, st);
    if (st.pos < s.length && s[st.pos] === ')') st.pos++;
    return val;
  }
  return parseNumber(s, st);
}

function parseNumber(s, st) {
  const start = st.pos;
  while (st.pos < s.length && /[0-9.]/.test(s[st.pos])) st.pos++;
  if (st.pos < s.length && s[st.pos] === 'e') {
    st.pos++;
    if (st.pos < s.length && (s[st.pos] === '+' || s[st.pos] === '-')) st.pos++;
    while (st.pos < s.length && /[0-9]/.test(s[st.pos])) st.pos++;
  }
  const numStr = s.slice(start, st.pos);
  return numStr ? parseFloat(numStr) : NaN;
}

// ── Input ──
function inputDigit(d) {
  if (freshResult) {
    expression = d; displayExpr = d;
    freshResult = false; lastAnswer = null; parenDepth = 0;
  } else {
    // ) 後面按數字 → 隱式乘法（parser 會處理，這裡只負責串接）
    expression += d; displayExpr += d;
  }
  clearOpHighlight();
  updateDisplay();
}

function inputDecimal() {
  const lastNum = expression.match(/[0-9.]*$/)?.[0] ?? '';
  if (lastNum.includes('.')) return;
  if (freshResult) {
    expression = '0.'; displayExpr = '0.'; freshResult = false; parenDepth = 0;
  } else if (!expression || /[+\-*/^(]$/.test(expression)) {
    expression += '0.'; displayExpr += '0.';
  } else {
    expression += '.'; displayExpr += '.';
  }
  updateDisplay();
}

function inputOperator(op) {
  if (freshResult) freshResult = false;
  // 空算式按 - 當負號
  if (!expression && op === '-') {
    expression = '-'; displayExpr = '−';
    updateDisplay(); return;
  }
  if (!expression) return;
  // 替換結尾運算符
  if (/[+\-*/^]$/.test(expression)) {
    expression  = expression.slice(0, -1);
    displayExpr = displayExpr.slice(0, -1);
  }
  const displayOp = { '+':'+', '-':'−', '*':'×', '/':'÷', '^':'^' }[op];
  expression  += op;
  displayExpr += displayOp;
  updateDisplay();
  clearOpHighlight();
  const map = { '+':'add', '-':'sub', '*':'mul', '/':'div' };
  const btn = document.getElementById('op-' + map[op]);
  if (btn) btn.classList.add('active');
}

function pressEquals() {
  // 連按 =：用上次的運算符和運算元重複計算
  if (freshResult && repeatOp) {
    try {
      const evalStr = expression + repeatOp.op + repeatOp.val;
      const result = evalExpr(evalStr);
      if (result === null || isNaN(result)) {
        $result.textContent = 'Error';
        $result.style.fontSize = '80px';
        return;
      }
      const resultStr = formatNum(result);
      $expr.textContent = formatNum(lastAnswer) + repeatExpr + ' =';
      $result.textContent = resultStr;
      autoFit();
      expression = String(result);
      displayExpr = resultStr;
      lastAnswer = result;
    } catch {
      $result.textContent = 'Error';
      $result.style.fontSize = '80px';
    }
    clearOpHighlight();
    return;
  }

  if (!expression) return;
  try {
    // 自動補右括號
    let evalStr = expression;
    let evalDisplay = displayExpr;
    for (let i = 0; i < parenDepth; i++) {
      evalStr += ')'; evalDisplay += ')';
    }
    // 結尾是運算符就移除
    evalStr = evalStr.replace(/[+\-*/^]+$/, '');

    // 記住最後的運算符和運算元，供連按 = 使用
    const repeatMatch = evalStr.match(/.*([+\-*/^])(.+)$/);
    if (repeatMatch) {
      const dispMap = { '+':'+', '-':'−', '*':'×', '/':'÷', '^':'^' };
      repeatOp = { op: repeatMatch[1], val: repeatMatch[2] };
      repeatExpr = (dispMap[repeatMatch[1]] || repeatMatch[1]) + addThousandSep(repeatMatch[2]);
    } else {
      repeatOp = null;
      repeatExpr = null;
    }

    const result = evalExpr(evalStr);
    if (result === null || isNaN(result)) {
      $result.textContent = 'Error';
      $result.style.fontSize = '80px';
      return;
    }
    const resultStr = formatNum(result);
    $expr.textContent = evalDisplay + ' =';
    $result.textContent = resultStr;
    autoFit();
    expression = String(result);
    displayExpr = resultStr;
    lastAnswer = result;
    freshResult = true;
    parenDepth = 0;
  } catch {
    $result.textContent = 'Error';
    $result.style.fontSize = '80px';
  }
  clearOpHighlight();
}

function pressClear() {
  expression = ''; displayExpr = '';
  freshResult = false; lastAnswer = null; parenDepth = 0;
  repeatOp = null; repeatExpr = null;
  updateDisplay();
  clearOpHighlight();
}

function pressBackspace() {
  if (freshResult) { pressClear(); return; }
  if (!expression) return;

  // 多字元 token 刪除（expression 和 displayExpr 長度不同）
  const multiTokens = [
    { expr: 'sqrt(', disp: '√(' },
    { expr: 'sqr(',  disp: 'sqr(' },
    { expr: 'inv(',  disp: '1/(' },
  ];
  for (const { expr, disp } of multiTokens) {
    if (expression.endsWith(expr) && displayExpr.endsWith(disp)) {
      expression  = expression.slice(0, -expr.length);
      displayExpr = displayExpr.slice(0, -disp.length);
      parenDepth--;
      updateDisplay(); return;
    }
  }

  // 刪括號要追蹤 parenDepth
  const lastChar = expression[expression.length - 1];
  if (lastChar === '(') parenDepth--;
  if (lastChar === ')') parenDepth++;

  expression  = expression.slice(0, -1);
  displayExpr = displayExpr.slice(0, -1);
  updateDisplay();
}

function pressToggleSign() {
  if (freshResult && lastAnswer !== null) {
    const neg = -lastAnswer;
    expression = String(neg); displayExpr = formatNum(neg);
    lastAnswer = neg; freshResult = false;
    updateDisplay(); return;
  }
  if (!expression) {
    expression = '-'; displayExpr = '−';
    updateDisplay(); return;
  }
  // 找最後一段數字，在前面加或移除負號
  const match = expression.match(/(.*?)(-?)(\d[\d.]*)$/);
  if (match) {
    const [, prefix, neg, num] = match;
    const matchD = displayExpr.match(/(.*?)(−?)(\d[\d.]*)$/);
    if (neg) {
      expression  = prefix + num;
      displayExpr = matchD[1] + matchD[3];
    } else {
      expression  = prefix + '-' + num;
      displayExpr = matchD[1] + '−' + matchD[3];
    }
  }
  updateDisplay();
}

function pressPercent() {
  if (!expression) return;
  expression  += '/100';
  displayExpr += '%';
  updateDisplay();
}

// ── Scientific ──
function applySciFunc(fn) {
  const fnMap = {
    x2:   { expr: 'sqr(',  disp: 'sqr(' },
    sqrt: { expr: 'sqrt(', disp: '√(' },
    inv:  { expr: 'inv(',  disp: '1/(' },
  };
  const { expr: ei, disp: di } = fnMap[fn];

  if (freshResult) {
    const prev = String(lastAnswer ?? 0);
    const prevD = formatNum(lastAnswer ?? 0);
    expression  = ei + prev + ')';
    displayExpr = di + prevD + ')';
    freshResult = false;
  } else {
    const num  = expression.match(/[\d.]+$/)?.[0] ?? '';
    const numD = displayExpr.match(/[\d.]+$/)?.[0] ?? '';
    if (num) {
      expression  = expression.slice(0, -num.length) + ei + num + ')';
      displayExpr = displayExpr.slice(0, -numD.length) + di + numD + ')';
    } else {
      expression  += ei; displayExpr += di; parenDepth++;
    }
  }
  updateDisplay();
}

function pressXY() {
  if (freshResult) {
    expression = String(lastAnswer ?? 0);
    displayExpr = formatNum(lastAnswer ?? 0);
    freshResult = false;
  }
  expression  += '^'; displayExpr += '^';
  updateDisplay();
}

function pressParenOpen() {
  if (freshResult) { expression = ''; displayExpr = ''; freshResult = false; }
  expression += '('; displayExpr += '('; parenDepth++;
  updateDisplay();
}

function pressParenClose() {
  if (parenDepth <= 0) return;
  expression += ')'; displayExpr += ')'; parenDepth--;
  updateDisplay();
}

function clearOpHighlight() {
  document.querySelectorAll('.op').forEach(b => b.classList.remove('active'));
}

// ── Keyboard ──
document.addEventListener('keydown', e => {
  if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
  else if (e.key === '.') inputDecimal();
  else if (e.key === '+') inputOperator('+');
  else if (e.key === '-') inputOperator('-');
  else if (e.key === '*') inputOperator('*');
  else if (e.key === '/') { e.preventDefault(); inputOperator('/'); }
  else if (e.key === '^') inputOperator('^');
  else if (e.key === '(') pressParenOpen();
  else if (e.key === ')') pressParenClose();
  else if (e.key === 'Enter' || e.key === '=') pressEquals();
  else if (e.key === 'Escape') pressClear();
  else if (e.key === '%') pressPercent();
  else if (e.key === 'Backspace') pressBackspace();
});

// ── Init ──
document.addEventListener('DOMContentLoaded', updateDisplay);
window.addEventListener('resize', autoFit);

// ── Service Worker ──
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
