// Vitest stand-in for the `server-only` package. The real module throws when
// imported outside a React Server Components graph, which is exactly what the
// production build enforces and what Node-based tests cannot provide.
export {};
