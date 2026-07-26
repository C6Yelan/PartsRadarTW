// scripts/test-database-safety.mjs
// 以 fail-closed 規則驗證測試資料庫 URL，不讓 isolation sentinel 成為唯一防線。

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const TEST_DATABASE_IDENTITIES = new Set([
  "partsradar_test/partsradar_test",
  "partsradar_e2e/partsradar_e2e",
]);

export function validateTestDatabaseEnvironment(env, { requiredUrls = ["DATABASE_URL"] } = {}) {
  if (env.PARTSRADAR_TEST_DATABASE_ISOLATED !== "1") {
    throw new Error("The disposable test database isolation marker is required.");
  }

  for (const name of requiredUrls) {
    if (!env[name]?.trim()) {
      throw new Error(`${name} is required for the disposable test database.`);
    }
  }

  const parsedUrls = new Map();

  for (const name of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
    const value = env[name]?.trim();
    if (value) {
      parsedUrls.set(name, parseSafeTestDatabaseUrl(name, value));
    }
  }

  const databaseUrl = parsedUrls.get("DATABASE_URL");
  const testDatabaseUrl = parsedUrls.get("TEST_DATABASE_URL");

  if (
    databaseUrl &&
    testDatabaseUrl &&
    ["host", "port", "username", "database"].some(
      (field) => databaseUrl[field] !== testDatabaseUrl[field],
    )
  ) {
    throw new Error(
      "DATABASE_URL and TEST_DATABASE_URL must identify the same disposable test database.",
    );
  }

  return Object.fromEntries(parsedUrls);
}

function parseSafeTestDatabaseUrl(name, value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  if (url.searchParams.size > 0) {
    throw new Error(`${name} must not include query parameters.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${name} must use the PostgreSQL protocol.`);
  }

  const host = normalizeHost(url.hostname);
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`${name} must use a loopback database host.`);
  }

  const username = decodeComponent(url.username, name);
  const database = decodeDatabaseName(url.pathname, name);
  const identity = `${username}/${database}`;

  if (!TEST_DATABASE_IDENTITIES.has(identity)) {
    throw new Error(`${name} must use an approved test-only username and database name.`);
  }

  if (!url.password) {
    throw new Error(`${name} must include test database credentials.`);
  }

  return {
    database,
    host,
    port: url.port || "5432",
    username,
  };
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function decodeComponent(value, name) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${name} contains an invalid encoded database identity.`);
  }
}

function decodeDatabaseName(pathname, name) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    throw new Error(`${name} must identify exactly one test database.`);
  }

  return decodeComponent(segments[0], name);
}
