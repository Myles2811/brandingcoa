export async function register() {
  // Only run in the Node.js server process, not edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/cron');
    startScheduler();
  }
}
