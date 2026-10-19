// Imported FIRST by rate-limit.e2e-spec.ts: the app reads the limit when its
// module is loaded, so it has to be set before the app is imported.
process.env.THROTTLE_AUTH_LIMIT = '3';
