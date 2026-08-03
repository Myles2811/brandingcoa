export async function register() {
  // liveDemoTue: the hourly scheduler is disabled for the static demo build. It reaches
  // Postgres and the Anthropic API, so leaving it running would throw
  // "DATABASE_URL is not configured" on the hour in a demo with no credentials.
}
