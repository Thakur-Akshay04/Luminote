/**
 * Pure TypeScript formula parser and evaluator for the Luminote spreadsheet.
 * Supports basic arithmetic (+, -, *, /, ^, parentheses) and common Excel functions:
 * SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, CONCATENATE, LEN, UPPER, LOWER, TRIM,
 * IFERROR, VLOOKUP, ABS, ROUND, PRODUCT, TODAY, NOW.
 */

// Helper to convert column label (A, B, C... Z, AA...) to 0-based index
export function colLabelToIndex(label: string): number {
  let index = 0;
  for (let i = 0; i < label.length; i++) {
    index = index * 26 + (label.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Helper to convert 0-based column index to label (A, B, C...)
export function indexToColLabel(index: number): string {
  let label = "";
  let temp = index;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

// Parses a cell reference like "A1" into { col: number, row: number } (0-based)
export function parseCellRef(ref: string): { col: number; row: number } | null {
  const match = ref.toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return null;
  return {
    col: colLabelToIndex(match[1]),
    row: parseInt(match[2], 10) - 1,
  };
}

// Retrieves all values in a range like "A1:B3"
export function getCellsInRange(
  rangeStr: string,
  cells: Record<string, { value?: any; formula?: string }>,
  evaluateCell: (ref: string) => any
): any[] {
  const parts = rangeStr.split(":");
  if (parts.length !== 2) {
    // Single cell
    return [evaluateCell(rangeStr.trim())];
  }

  const start = parseCellRef(parts[0].trim());
  const end = parseCellRef(parts[1].trim());

  if (!start || !end) return [];

  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);

  const values: any[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const ref = `${indexToColLabel(c)}${r + 1}`;
      values.push(evaluateCell(ref));
    }
  }
  return values;
}

/**
 * Main evaluation entry point.
 */
export function evaluateFormula(
  formulaStr: string,
  cells: Record<string, { value?: any; formula?: string }>,
  currentCellRef?: string,
  visited: Set<string> = new Set()
): any {
  if (!formulaStr.startsWith("=")) {
    return parseValue(formulaStr);
  }

  if (currentCellRef) {
    if (visited.has(currentCellRef)) {
      return "#REF!"; // Circular reference
    }
    visited.add(currentCellRef);
  }

  const expression = formulaStr.substring(1).trim();

  // Helper to evaluate a cell recursively
  const evaluateCell = (ref: string): any => {
    const uppercaseRef = ref.toUpperCase();
    const cell = cells[uppercaseRef];
    if (!cell) return null;

    if (cell.formula) {
      const subVisited = new Set(visited);
      return evaluateFormula(cell.formula, cells, uppercaseRef, subVisited);
    }
    return cell.value;
  };

  try {
    const result = parseAndEvaluateExpression(expression, cells, evaluateCell);
    if (currentCellRef) visited.delete(currentCellRef);
    return result;
  } catch (err) {
    if (currentCellRef) visited.delete(currentCellRef);
    return "#VALUE!";
  }
}

function parseValue(val: string): any {
  if (val === "") return "";
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

// A simple expression parser for basic math (+, -, *, /, ^, brackets, functions)
function parseAndEvaluateExpression(
  expr: string,
  cells: Record<string, { value?: any; formula?: string }>,
  evaluateCell: (ref: string) => any
): any {
  let index = 0;

  function peek(): string {
    return index < expr.length ? expr[index] : "";
  }

  function consume(): string {
    return index < expr.length ? expr[index++] : "";
  }

  function skipWhitespace() {
    while (index < expr.length && /\s/.test(expr[index])) {
      index++;
    }
  }

  // Parse a function argument list (comma separated, handling parentheses)
  function parseArgs(): string[] {
    if (peek() !== "(") throw new Error("Expected '(' for arguments");
    consume(); // '('
    const args: string[] = [];
    let currentArg = "";
    let parenDepth = 0;
    let inQuotes = false;

    while (index < expr.length) {
      const char = peek();
      if (char === '"') {
        inQuotes = !inQuotes;
        currentArg += consume();
      } else if (!inQuotes && char === "(") {
        parenDepth++;
        currentArg += consume();
      } else if (!inQuotes && char === ")") {
        if (parenDepth === 0) {
          consume(); // ')'
          args.push(currentArg.trim());
          return args;
        } else {
          parenDepth--;
          currentArg += consume();
        }
      } else if (!inQuotes && char === "," && parenDepth === 0) {
        consume(); // ','
        args.push(currentArg.trim());
        currentArg = "";
      } else {
        currentArg += consume();
      }
    }
    throw new Error("Unterminated function call");
  }

  // Primary expression parser (handles numbers, string literals, cell references, functions, parenthesized expressions)
  function parsePrimary(): any {
    skipWhitespace();
    const char = peek();

    if (char === '"') {
      consume(); // '"'
      let str = "";
      while (index < expr.length && peek() !== '"') {
        str += consume();
      }
      if (peek() === '"') consume(); // '"'
      return str;
    }

    if (char === "(") {
      consume(); // '('
      const val = parseExpr();
      skipWhitespace();
      if (peek() === ")") {
        consume(); // ')'
      }
      return val;
    }

    // Number, Cell reference, or Function
    let token = "";
    while (index < expr.length && /[a-zA-Z0-9_.:]/.test(peek())) {
      token += consume();
    }

    if (token === "") {
      // Could be a unary minus
      if (peek() === "-") {
        consume();
        return -parsePrimary();
      }
      if (peek() === "+") {
        consume();
        return parsePrimary();
      }
      return null;
    }

    // If it's followed by a '(' then it's a function call!
    skipWhitespace();
    if (peek() === "(") {
      const args = parseArgs();
      return evaluateFunction(token.toUpperCase(), args, cells, evaluateCell);
    }

    // Check if it's a cell reference like A1
    if (/^[A-Z]+[0-9]+$/i.test(token)) {
      const val = evaluateCell(token);
      return val === undefined || val === null ? 0 : val;
    }

    // Otherwise, parse as a number or string
    const num = Number(token);
    if (!isNaN(num)) return num;
    if (token.toLowerCase() === "true") return true;
    if (token.toLowerCase() === "false") return false;
    return token;
  }

  // Parse exponentiation: ^
  function parseExponent(): any {
    let left = parsePrimary();
    skipWhitespace();
    while (peek() === "^") {
      consume(); // '^'
      const right = parsePrimary();
      left = Math.pow(Number(left), Number(right));
      skipWhitespace();
    }
    return left;
  }

  // Parse multiplicative: *, /
  function parseMultiplicative(): any {
    let left = parseExponent();
    skipWhitespace();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseExponent();
      if (op === "*") {
        left = Number(left) * Number(right);
      } else {
        if (Number(right) === 0) return "#DIV/0!";
        left = Number(left) / Number(right);
      }
      skipWhitespace();
    }
    return left;
  }

  // Parse additive: +, -
  function parseExpr(): any {
    let left = parseMultiplicative();
    skipWhitespace();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseMultiplicative();
      if (op === "+") {
        left = Number(left) + Number(right);
      } else {
        left = Number(left) - Number(right);
      }
      skipWhitespace();
    }
    return left;
  }

  return parseExpr();
}

// Built-in Excel functions evaluator
function evaluateFunction(
  name: string,
  args: string[],
  cells: Record<string, { value?: any; formula?: string }>,
  evaluateCell: (ref: string) => any
): any {
  // Helpers to resolve arguments to values/lists
  const getArgVal = (arg: string) => {
    if (arg === "") return "";
    if (arg.startsWith('"') && arg.endsWith('"')) {
      return arg.substring(1, arg.length - 1);
    }
    // Check if it's a cell ref or range
    if (/^[A-Z]+[0-9]+$/i.test(arg)) {
      return evaluateCell(arg);
    }
    if (arg.includes(":")) {
      return getCellsInRange(arg, cells, evaluateCell);
    }
    // Otherwise try parsing expression directly
    try {
      if (arg.startsWith("=")) {
        return evaluateFormula(arg, cells, undefined);
      } else {
        return evaluateFormula("=" + arg, cells, undefined);
      }
    } catch {
      const num = Number(arg);
      return isNaN(num) ? arg : num;
    }
  };

  const getFlatValues = (argsList: string[]): any[] => {
    const list: any[] = [];
    for (const arg of argsList) {
      const val = getArgVal(arg);
      if (Array.isArray(val)) {
        list.push(...val);
      } else {
        list.push(val);
      }
    }
    return list;
  };

  const getNumericValues = (argsList: string[]): number[] => {
    return getFlatValues(argsList)
      .map((v) => Number(v))
      .filter((n) => !isNaN(n) && n !== null && typeof n === "number");
  };

  switch (name) {
    case "SUM": {
      const nums = getNumericValues(args);
      return nums.reduce((sum, n) => sum + n, 0);
    }

    case "AVERAGE":
    case "AVG": {
      const nums = getNumericValues(args);
      if (nums.length === 0) return 0;
      return nums.reduce((sum, n) => sum + n, 0) / nums.length;
    }

    case "MIN": {
      const nums = getNumericValues(args);
      if (nums.length === 0) return 0;
      return Math.min(...nums);
    }

    case "MAX": {
      const nums = getNumericValues(args);
      if (nums.length === 0) return 0;
      return Math.max(...nums);
    }

    case "COUNT": {
      // Counts only numeric values
      const vals = getFlatValues(args);
      return vals.filter((v) => typeof v === "number" && !isNaN(v)).length;
    }

    case "COUNTA": {
      // Counts non-empty cells/values
      const vals = getFlatValues(args);
      return vals.filter((v) => v !== "" && v !== null && v !== undefined).length;
    }

    case "PRODUCT": {
      const nums = getNumericValues(args);
      if (nums.length === 0) return 0;
      return nums.reduce((prod, n) => prod * n, 1);
    }

    case "ABS": {
      if (args.length !== 1) return "#VALUE!";
      return Math.abs(Number(getArgVal(args[0])));
    }

    case "ROUND": {
      if (args.length < 1 || args.length > 2) return "#VALUE!";
      const num = Number(getArgVal(args[0]));
      const digits = args.length === 2 ? Number(getArgVal(args[1])) : 0;
      if (isNaN(num) || isNaN(digits)) return "#VALUE!";
      const factor = Math.pow(10, digits);
      return Math.round(num * factor) / factor;
    }

    case "IF": {
      if (args.length < 2 || args.length > 3) return "#VALUE!";
      const conditionVal = getArgVal(args[0]);
      // Basic truthiness check
      const condition = !!conditionVal && conditionVal !== "FALSE" && conditionVal !== 0;
      if (condition) {
        return getArgVal(args[1]);
      } else {
        return args.length === 3 ? getArgVal(args[2]) : "";
      }
    }

    case "CONCATENATE": {
      const vals = getFlatValues(args);
      return vals.map((v) => (v === null || v === undefined ? "" : String(v))).join("");
    }

    case "LEN": {
      if (args.length !== 1) return "#VALUE!";
      const val = getArgVal(args[0]);
      return val === null || val === undefined ? 0 : String(val).length;
    }

    case "UPPER": {
      if (args.length !== 1) return "#VALUE!";
      const val = getArgVal(args[0]);
      return val === null || val === undefined ? "" : String(val).toUpperCase();
    }

    case "LOWER": {
      if (args.length !== 1) return "#VALUE!";
      const val = getArgVal(args[0]);
      return val === null || val === undefined ? "" : String(val).toLowerCase();
    }

    case "TRIM": {
      if (args.length !== 1) return "#VALUE!";
      const val = getArgVal(args[0]);
      return val === null || val === undefined ? "" : String(val).trim().replace(/\s+/g, " ");
    }

    case "IFERROR": {
      if (args.length !== 2) return "#VALUE!";
      const val = getArgVal(args[0]);
      if (
        val === "#VALUE!" ||
        val === "#DIV/0!" ||
        val === "#REF!" ||
        val === "#NAME?" ||
        val === "#N/A"
      ) {
        return getArgVal(args[1]);
      }
      return val;
    }

    case "VLOOKUP": {
      if (args.length < 3 || args.length > 4) return "#VALUE!";
      const lookupVal = getArgVal(args[0]);
      const rangeStr = args[1];
      const colIndex = Number(getArgVal(args[2]));
      const approximateMatch = args.length === 4 ? getArgVal(args[3]) === true : false;

      if (!rangeStr.includes(":")) return "#N/A";
      const parts = rangeStr.split(":");
      const start = parseCellRef(parts[0].trim());
      const end = parseCellRef(parts[1].trim());
      if (!start || !end) return "#N/A";

      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);

      // Width of table range
      const tableWidth = maxCol - minCol + 1;
      if (colIndex < 1 || colIndex > tableWidth) return "#VALUE!";

      let foundValue: any = "#N/A";

      // Scan rows
      for (let r = minRow; r <= maxRow; r++) {
        // Key cell in the first column of the range
        const keyRef = `${indexToColLabel(minCol)}${r + 1}`;
        const keyVal = evaluateCell(keyRef);

        // Simple match
        const matches = String(keyVal).toLowerCase() === String(lookupVal).toLowerCase();
        if (matches) {
          const targetRef = `${indexToColLabel(minCol + colIndex - 1)}${r + 1}`;
          foundValue = evaluateCell(targetRef);
          break;
        }
      }
      return foundValue;
    }

    case "TODAY": {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    }

    case "NOW": {
      return new Date().toISOString();
    }

    default:
      return "#NAME?";
  }
}
