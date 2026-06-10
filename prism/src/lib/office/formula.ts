// Spreadsheet formula evaluator — supports =SUM(A1:B3), =AVERAGE(...), =MIN, =MAX,
// =COUNT, =COUNTA, =IF(cond, a, b), cell refs (A1), arithmetic (+ - * / ^),
// parentheses, numbers, strings. Good enough for a mini-Excel.

export type CellValue = string | number | boolean;

const COL_RE = /^[A-Z]+/;

export function colLabel(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(label: string): number {
  let n = 0;
  for (const ch of label) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export interface CellRef {
  row: number; // 0-based
  col: number; // 0-based
}

export function parseRef(ref: string): CellRef | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  const col = colIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (row < 0) return null;
  return { row, col };
}

export interface ParsedRange {
  start: CellRef;
  end: CellRef;
}

export function parseRange(s: string): ParsedRange | null {
  const parts = s.split(":");
  if (parts.length !== 2) return null;
  const a = parseRef(parts[0].trim());
  const b = parseRef(parts[1].trim());
  if (!a || !b) return null;
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

type ResolveFn = (row: number, col: number, visited: Set<string>) => CellValue;

// ─────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────

type TokType =
  | "num"
  | "str"
  | "ref"
  | "range"
  | "ident"
  | "op"
  | "lp"
  | "rp"
  | "comma"
  | "end";

interface Tok {
  type: TokType;
  value: string;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ type: "lp", value: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ type: "rp", value: ")" });
      i++;
      continue;
    }
    if (c === ",") {
      toks.push({ type: "comma", value: "," });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      toks.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "=" || c === "<" || c === ">") {
      let op = c;
      if (src[i + 1] === "=") {
        op += "=";
        i += 2;
      } else if (c === "<" && src[i + 1] === ">") {
        op = "<>";
        i += 2;
      } else {
        i++;
      }
      toks.push({ type: "op", value: op });
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else {
          s += src[j];
          j++;
        }
      }
      toks.push({ type: "str", value: s });
      i = j + 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (
        j < src.length &&
        ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")
      )
        j++;
      toks.push({ type: "num", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
      let j = i;
      while (
        j < src.length &&
        ((src[j] >= "A" && src[j] <= "Z") ||
          (src[j] >= "a" && src[j] <= "z") ||
          (src[j] >= "0" && src[j] <= "9") ||
          src[j] === "_")
      )
        j++;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();
      // Cell ref or range?
      if (COL_RE.test(upper) && /\d/.test(upper)) {
        // Check for range A1:B5
        if (src[j] === ":") {
          let k = j + 1;
          while (
            k < src.length &&
            ((src[k] >= "A" && src[k] <= "Z") ||
              (src[k] >= "a" && src[k] <= "z") ||
              (src[k] >= "0" && src[k] <= "9"))
          )
            k++;
          toks.push({ type: "range", value: src.slice(i, k).toUpperCase() });
          i = k;
          continue;
        }
        toks.push({ type: "ref", value: upper });
        i = j;
        continue;
      }
      toks.push({ type: "ident", value: upper });
      i = j;
      continue;
    }
    // Unknown → skip
    i++;
  }
  toks.push({ type: "end", value: "" });
  return toks;
}

// ─────────────────────────────────────────────────────────────
// Parser — recursive descent (Pratt-ish precedence).
// ─────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  peek() {
    return this.toks[this.pos];
  }
  consume() {
    return this.toks[this.pos++];
  }
  expect(t: TokType, v?: string): Tok {
    const tk = this.peek();
    if (tk.type !== t || (v !== undefined && tk.value !== v))
      throw new Error(`Expected ${t}${v ? ` ${v}` : ""}, got ${tk.type} ${tk.value}`);
    return this.consume();
  }

  parseExpr(): AstNode {
    return this.parseCmp();
  }

  parseCmp(): AstNode {
    let left = this.parseAdd();
    while (
      this.peek().type === "op" &&
      ["=", "<>", "<", ">", "<=", ">="].includes(this.peek().value)
    ) {
      const op = this.consume().value;
      const right = this.parseAdd();
      left = { kind: "binop", op, left, right };
    }
    return left;
  }

  parseAdd(): AstNode {
    let left = this.parseMul();
    while (
      this.peek().type === "op" &&
      (this.peek().value === "+" || this.peek().value === "-")
    ) {
      const op = this.consume().value;
      const right = this.parseMul();
      left = { kind: "binop", op, left, right };
    }
    return left;
  }

  parseMul(): AstNode {
    let left = this.parsePow();
    while (
      this.peek().type === "op" &&
      (this.peek().value === "*" || this.peek().value === "/")
    ) {
      const op = this.consume().value;
      const right = this.parsePow();
      left = { kind: "binop", op, left, right };
    }
    return left;
  }

  parsePow(): AstNode {
    let left = this.parseUnary();
    while (this.peek().type === "op" && this.peek().value === "^") {
      this.consume();
      const right = this.parseUnary();
      left = { kind: "binop", op: "^", left, right };
    }
    return left;
  }

  parseUnary(): AstNode {
    if (
      this.peek().type === "op" &&
      (this.peek().value === "-" || this.peek().value === "+")
    ) {
      const op = this.consume().value;
      const expr = this.parseUnary();
      return { kind: "unary", op, expr };
    }
    return this.parsePrimary();
  }

  parsePrimary(): AstNode {
    const t = this.peek();
    if (t.type === "num") {
      this.consume();
      return { kind: "num", value: Number(t.value) };
    }
    if (t.type === "str") {
      this.consume();
      return { kind: "str", value: t.value };
    }
    if (t.type === "ref") {
      this.consume();
      const r = parseRef(t.value)!;
      return { kind: "ref", row: r.row, col: r.col };
    }
    if (t.type === "range") {
      this.consume();
      const r = parseRange(t.value)!;
      return { kind: "range", start: r.start, end: r.end };
    }
    if (t.type === "ident") {
      this.consume();
      if (this.peek().type === "lp") {
        this.consume();
        const args: AstNode[] = [];
        if (this.peek().type !== "rp") {
          args.push(this.parseExpr());
          while (this.peek().type === "comma") {
            this.consume();
            args.push(this.parseExpr());
          }
        }
        this.expect("rp");
        return { kind: "call", name: t.value, args };
      }
      // Bare identifier → treat as string (TRUE/FALSE special-cased)
      if (t.value === "TRUE") return { kind: "bool", value: true };
      if (t.value === "FALSE") return { kind: "bool", value: false };
      return { kind: "str", value: t.value };
    }
    if (t.type === "lp") {
      this.consume();
      const e = this.parseExpr();
      this.expect("rp");
      return e;
    }
    throw new Error(`Unexpected token ${t.type} ${t.value}`);
  }
}

type AstNode =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ref"; row: number; col: number }
  | { kind: "range"; start: CellRef; end: CellRef }
  | { kind: "call"; name: string; args: AstNode[] }
  | { kind: "unary"; op: string; expr: AstNode }
  | { kind: "binop"; op: string; left: AstNode; right: AstNode };

// ─────────────────────────────────────────────────────────────
// Evaluator
// ─────────────────────────────────────────────────────────────

function toNumber(v: CellValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function expandRange(
  node: Extract<AstNode, { kind: "range" }>,
  resolve: ResolveFn,
  visited: Set<string>
): CellValue[] {
  const out: CellValue[] = [];
  for (let r = node.start.row; r <= node.end.row; r++) {
    for (let c = node.start.col; c <= node.end.col; c++) {
      out.push(resolve(r, c, visited));
    }
  }
  return out;
}

function flattenArgs(
  args: AstNode[],
  resolve: ResolveFn,
  visited: Set<string>
): CellValue[] {
  const out: CellValue[] = [];
  for (const a of args) {
    if (a.kind === "range") {
      out.push(...expandRange(a, resolve, visited));
    } else {
      out.push(evalNode(a, resolve, visited));
    }
  }
  return out;
}

function evalNode(
  n: AstNode,
  resolve: ResolveFn,
  visited: Set<string>
): CellValue {
  switch (n.kind) {
    case "num":
      return n.value;
    case "str":
      return n.value;
    case "bool":
      return n.value;
    case "ref":
      return resolve(n.row, n.col, visited);
    case "range":
      // Lone range evaluates to its top-left.
      return resolve(n.start.row, n.start.col, visited);
    case "unary": {
      const v = toNumber(evalNode(n.expr, resolve, visited));
      return n.op === "-" ? -v : v;
    }
    case "binop": {
      if (n.op === "&") {
        return String(evalNode(n.left, resolve, visited)) +
          String(evalNode(n.right, resolve, visited));
      }
      const lv = evalNode(n.left, resolve, visited);
      const rv = evalNode(n.right, resolve, visited);
      if (n.op === "=") return asEqual(lv, rv);
      if (n.op === "<>") return !asEqual(lv, rv);
      const a = toNumber(lv);
      const b = toNumber(rv);
      if (!Number.isFinite(a) || !Number.isFinite(b))
        return "#VALUE!";
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? "#DIV/0!" : a / b;
        case "^":
          return Math.pow(a, b);
        case "<":
          return a < b;
        case ">":
          return a > b;
        case "<=":
          return a <= b;
        case ">=":
          return a >= b;
      }
      return "#OP!";
    }
    case "call":
      return callFn(n.name, n.args, resolve, visited);
  }
}

function asEqual(a: CellValue, b: CellValue): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return toNumber(a) === toNumber(b);
  }
  return String(a) === String(b);
}

function callFn(
  name: string,
  args: AstNode[],
  resolve: ResolveFn,
  visited: Set<string>
): CellValue {
  const vals = flattenArgs(args, resolve, visited);
  switch (name) {
    case "SUM":
      return vals.reduce<number>(
        (acc, v) => acc + (Number.isFinite(toNumber(v)) ? toNumber(v) : 0),
        0
      );
    case "AVERAGE":
    case "AVG": {
      const nums = vals.map(toNumber).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return "#DIV/0!";
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "MIN": {
      const nums = vals.map(toNumber).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return 0;
      return Math.min(...nums);
    }
    case "MAX": {
      const nums = vals.map(toNumber).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return 0;
      return Math.max(...nums);
    }
    case "COUNT":
      return vals.filter((v) => Number.isFinite(toNumber(v)) && v !== "").length;
    case "COUNTA":
      return vals.filter((v) => v !== "" && v !== null && v !== undefined).length;
    case "IF": {
      if (args.length < 2) return "#N/A";
      const cond = evalNode(args[0], resolve, visited);
      const truthy =
        typeof cond === "boolean"
          ? cond
          : typeof cond === "number"
            ? cond !== 0
            : String(cond).toLowerCase() === "true";
      return evalNode(truthy ? args[1] : args[2] ?? { kind: "bool", value: false }, resolve, visited);
    }
    case "ROUND": {
      const a = toNumber(vals[0] ?? 0);
      const d = Math.floor(toNumber(vals[1] ?? 0));
      const f = Math.pow(10, d);
      return Math.round(a * f) / f;
    }
    case "ABS":
      return Math.abs(toNumber(vals[0] ?? 0));
    case "POWER":
      return Math.pow(toNumber(vals[0] ?? 0), toNumber(vals[1] ?? 0));
    case "SQRT":
      return Math.sqrt(toNumber(vals[0] ?? 0));
    case "CONCAT":
    case "CONCATENATE":
      return vals.map(String).join("");
    case "LEN":
      return String(vals[0] ?? "").length;
    case "UPPER":
      return String(vals[0] ?? "").toUpperCase();
    case "LOWER":
      return String(vals[0] ?? "").toLowerCase();
    case "TRIM":
      return String(vals[0] ?? "").trim();
    case "NOW":
      return new Date().toLocaleString();
    case "TODAY":
      return new Date().toLocaleDateString();
    case "PI":
      return Math.PI;
  }
  return `#NAME?`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface EvaluateOpts {
  cells: string[][];
}

/** Evaluate one cell (row,col). Formulas start with "=". */
export function evaluateCell(row: number, col: number, opts: EvaluateOpts): CellValue {
  return resolveCell(row, col, opts.cells, new Set());
}

function resolveCell(
  row: number,
  col: number,
  cells: string[][],
  visited: Set<string>
): CellValue {
  const key = `${row},${col}`;
  if (visited.has(key)) return "#CIRC!";
  if (row < 0 || row >= cells.length) return "";
  const r = cells[row];
  if (!r || col < 0 || col >= r.length) return "";
  const raw = r[col] ?? "";
  if (raw === "") return "";
  if (!raw.startsWith("=")) {
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) return n;
    return raw;
  }
  // Formula
  const nextVisited = new Set(visited);
  nextVisited.add(key);
  try {
    const toks = tokenize(raw.slice(1));
    const parser = new Parser(toks);
    const ast = parser.parseExpr();
    return evalNode(ast, (r2, c2, v) => resolveCell(r2, c2, cells, v), nextVisited);
  } catch {
    return "#ERROR!";
  }
}

export function formatCell(v: CellValue): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "#NUM!";
    if (Number.isInteger(v)) return String(v);
    // Trim trailing zeros.
    return v.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}
