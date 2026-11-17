// Loaded before test files. Real network access is restricted to loopback.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)
  ) {
    process.exitCode = 1;
    throw new Error("Test safety guard blocked an external network request.");
  }
  return realFetch(input, { ...init, redirect: "error" });
};
