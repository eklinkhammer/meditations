/**
 * Proxy-based Drizzle mock.
 * Chains any method call (.select(), .from(), .where(), etc.) and
 * resolves to a configurable value when awaited.
 */
export function createMockDb(resolveValue: unknown = []) {
  function createChain(currentResolve: unknown): unknown {
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          // Make the proxy thenable — resolves with currentResolve
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            Promise.resolve(currentResolve).then(resolve, reject);
          };
        }
        if (prop === 'transaction') {
          // .transaction() passes the mock as `tx`
          return (fn: (tx: unknown) => Promise<unknown>) => fn(createMockDb(currentResolve));
        }
        // Any other property returns a function that keeps chaining
        return (..._args: unknown[]) => createChain(currentResolve);
      },
    };
    return new Proxy({}, handler);
  }

  return createChain(resolveValue);
}

/**
 * Create a mock db where specific operations can return different values.
 * Use setResult() to change what the next chain resolves to.
 */
export function createControllableMockDb() {
  let nextResult: unknown = [];

  const mock = {
    setResult(value: unknown) {
      nextResult = value;
    },
    get db() {
      return createMockDb(nextResult);
    },
  };

  return mock;
}
