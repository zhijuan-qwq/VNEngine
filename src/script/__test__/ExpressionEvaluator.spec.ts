import VariableStore from '../VariableStore';
import { evaluateExpression, isTruthy } from '../ExpressionEvaluator';

describe('ExpressionEvaluator', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = new VariableStore();
  });

  describe('evaluateExpression', () => {
    it('should return literal values as-is', () => {
      expect(evaluateExpression(42, store)).toBe(42);
      expect(evaluateExpression('hello', store)).toBe('hello');
      expect(evaluateExpression(true, store)).toBe(true);
      expect(evaluateExpression(false, store)).toBe(false);
      expect(evaluateExpression(null, store)).toBe(null);
    });

    it('should resolve variable references', () => {
      store.set('score', 100);
      expect(evaluateExpression({ type: 'var', name: 'score' }, store)).toBe(
        100,
      );
    });

    it('should return undefined for non-existent variables', () => {
      expect(evaluateExpression({ type: 'var', name: 'missing' }, store)).toBe(
        undefined,
      );
    });

    it('should resolve flag checks', () => {
      store.setFlag('met_hero');
      expect(
        evaluateExpression({ type: 'flag', name: 'met_hero' }, store),
      ).toBe(true);
    });

    it('should return false for non-existent flags', () => {
      expect(evaluateExpression({ type: 'flag', name: 'unknown' }, store)).toBe(
        false,
      );
    });

    describe('unary operators', () => {
      it('should negate with !', () => {
        expect(
          evaluateExpression({ type: 'unary', op: '!', expr: true }, store),
        ).toBe(false);
        expect(
          evaluateExpression({ type: 'unary', op: '!', expr: false }, store),
        ).toBe(true);
      });

      it('should negate with ! on resolved variable', () => {
        store.set('flag', true);
        expect(
          evaluateExpression(
            {
              type: 'unary',
              op: '!',
              expr: { type: 'var', name: 'flag' },
            },
            store,
          ),
        ).toBe(false);
      });

      it('should arithmetic negate with -', () => {
        expect(
          evaluateExpression({ type: 'unary', op: '-', expr: 5 }, store),
        ).toBe(-5);
      });

      it('should arithmetic negate resolved variable', () => {
        store.set('x', 10);
        expect(
          evaluateExpression(
            {
              type: 'unary',
              op: '-',
              expr: { type: 'var', name: 'x' },
            },
            store,
          ),
        ).toBe(-10);
      });
    });

    describe('comparison operators', () => {
      it('should compare with ==', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '==', left: 42, right: 42 },
            store,
          ),
        ).toBe(true);
      });

      it('should compare with !=', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '!=', left: 42, right: 43 },
            store,
          ),
        ).toBe(true);
      });

      it('should compare with >', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '>', left: 5, right: 3 },
            store,
          ),
        ).toBe(true);
        expect(
          evaluateExpression(
            { type: 'binary', op: '>', left: 3, right: 5 },
            store,
          ),
        ).toBe(false);
      });

      it('should compare with >=', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '>=', left: 5, right: 5 },
            store,
          ),
        ).toBe(true);
      });

      it('should compare with <', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '<', left: 3, right: 5 },
            store,
          ),
        ).toBe(true);
      });

      it('should compare with <=', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '<=', left: 5, right: 5 },
            store,
          ),
        ).toBe(true);
      });
    });

    describe('logical operators', () => {
      it('should evaluate and', () => {
        expect(
          evaluateExpression(
            {
              type: 'binary',
              op: 'and',
              left: true,
              right: true,
            },
            store,
          ),
        ).toBe(true);
        expect(
          evaluateExpression(
            {
              type: 'binary',
              op: 'and',
              left: true,
              right: false,
            },
            store,
          ),
        ).toBe(false);
        expect(
          evaluateExpression(
            {
              type: 'binary',
              op: 'and',
              left: false,
              right: true,
            },
            store,
          ),
        ).toBe(false);
      });

      it('should evaluate or', () => {
        expect(
          evaluateExpression(
            {
              type: 'binary',
              op: 'or',
              left: false,
              right: false,
            },
            store,
          ),
        ).toBe(false);
        expect(
          evaluateExpression(
            {
              type: 'binary',
              op: 'or',
              left: true,
              right: false,
            },
            store,
          ),
        ).toBe(true);
      });
    });

    describe('arithmetic operators', () => {
      it('should add', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '+', left: 3, right: 4 },
            store,
          ),
        ).toBe(7);
      });

      it('should subtract', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '-', left: 10, right: 3 },
            store,
          ),
        ).toBe(7);
      });

      it('should multiply', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '*', left: 3, right: 4 },
            store,
          ),
        ).toBe(12);
      });

      it('should divide', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '/', left: 8, right: 2 },
            store,
          ),
        ).toBe(4);
      });

      it('should modulo', () => {
        expect(
          evaluateExpression(
            { type: 'binary', op: '%', left: 10, right: 3 },
            store,
          ),
        ).toBe(1);
      });
    });

    describe('nested expressions', () => {
      it('should evaluate compound expression', () => {
        store.set('affection', 80);
        const expr = {
          type: 'binary',
          op: '>=',
          left: { type: 'var', name: 'affection' },
          right: 50,
        };
        expect(evaluateExpression(expr, store)).toBe(true);
      });

      it('should evaluate nested logical expressions', () => {
        store.set('a', 10);
        store.set('b', 5);
        const expr = {
          type: 'binary',
          op: 'and',
          left: {
            type: 'binary',
            op: '>',
            left: { type: 'var', name: 'a' },
            right: 5,
          },
          right: {
            type: 'binary',
            op: '<',
            left: { type: 'var', name: 'b' },
            right: 10,
          },
        };
        expect(evaluateExpression(expr, store)).toBe(true);
      });
    });
  });

  describe('isTruthy', () => {
    it('should return false for null', () => {
      expect(isTruthy(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isTruthy(undefined)).toBe(false);
    });

    it('should return false for false', () => {
      expect(isTruthy(false)).toBe(false);
    });

    it('should return false for 0', () => {
      expect(isTruthy(0)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isTruthy('')).toBe(false);
    });

    it('should return true for true', () => {
      expect(isTruthy(true)).toBe(true);
    });

    it('should return true for non-zero numbers', () => {
      expect(isTruthy(1)).toBe(true);
      expect(isTruthy(-1)).toBe(true);
    });

    it('should return true for non-empty strings', () => {
      expect(isTruthy('hello')).toBe(true);
    });

    it('should return true for objects', () => {
      expect(isTruthy({})).toBe(true);
    });
  });
});
