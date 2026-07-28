import type { VariableStore } from './VariableStore';

interface ExprNode {
  type: 'binary' | 'unary' | 'var' | 'flag';
  op?: string;
  left?: unknown;
  right?: unknown;
  expr?: unknown;
  name?: string;
}

function isExprNode(value: unknown): value is ExprNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    node.type === 'binary' ||
    node.type === 'unary' ||
    node.type === 'var' ||
    node.type === 'flag'
  );
}

function evalExpr(node: unknown, store: VariableStore): unknown {
  if (!isExprNode(node)) return node;

  switch (node.type) {
    case 'var':
      return store.get(node.name as string);
    case 'flag':
      return store.hasFlag(node.name as string);
    case 'unary': {
      const val = evalExpr(node.expr, store);
      if (node.op === '!') return !val;
      if (node.op === '-') return -(val as number);
      throw new Error(`Unknown unary operator: ${node.op}`);
    }
    case 'binary': {
      const left = evalExpr(node.left, store);
      const right = evalExpr(node.right, store);
      return applyBinaryOp(node.op as string, left, right);
    }
    default:
      return node;
  }
}

function applyBinaryOp(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return (left as number) > (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<':
      return (left as number) < (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case 'and':
      return left && right;
    case 'or':
      return left || right;
    case '+':
      return (left as number) + (right as number);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);
    default:
      throw new Error(`Unknown binary operator: ${op}`);
  }
}

function evaluateExpression(expr: unknown, store: VariableStore): unknown {
  return evalExpr(expr, store);
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

export { evaluateExpression, isTruthy, isExprNode };
