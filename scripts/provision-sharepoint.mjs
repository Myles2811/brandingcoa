import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const psScript = path.join(root, 'scripts', 'provision-sharepoint-sites-selected.ps1');
let server = null;

function commandExists(command) {
  return spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function runReturningStatus(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0));
  });
}

async function ensurePowerShell() {
  if (commandExists('pwsh')) return 'pwsh';
  if (process.platform !== 'darwin') throw new Error('Automatic PowerShell installation is currently configured for macOS.');

  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
  const installDirectory = path.join(os.homedir(), '.cache', 'ps-awards-scanner', `powershell-osx-${architecture}`);
  const executable = path.join(installDirectory, 'pwsh');
  if (spawnSync(executable, ['-NoLogo', '-Command', '$PSVersionTable.PSVersion.ToString()'], { stdio: 'ignore' }).status === 0) return executable;

  console.log('PowerShell is not installed. Downloading the latest stable Microsoft release to the user cache...');
  const releaseResponse = await fetch('https://api.github.com/repos/PowerShell/PowerShell/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ps-awards-scanner-provisioner' },
  });
  if (!releaseResponse.ok) throw new Error(`Unable to resolve the latest PowerShell release (${releaseResponse.status}).`);
  const release = await releaseResponse.json();
  const asset = release.assets?.find(candidate => new RegExp(`^powershell-.*-osx-${architecture}\\.tar\\.gz$`).test(candidate.name));
  if (!asset?.browser_download_url) throw new Error(`No macOS ${architecture} archive was found in the latest PowerShell release.`);

  const archiveResponse = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'ps-awards-scanner-provisioner' } });
  if (!archiveResponse.ok) throw new Error(`PowerShell download failed (${archiveResponse.status}).`);
  const archive = path.join(os.tmpdir(), asset.name);
  await writeFile(archive, Buffer.from(await archiveResponse.arrayBuffer()));
  await rm(installDirectory, { recursive: true, force: true });
  await mkdir(installDirectory, { recursive: true });
  await run('tar', ['-xzf', archive, '-C', installDirectory]);
  await rm(archive, { force: true });
  await chmod(executable, 0o755);
  if (spawnSync(executable, ['-NoLogo', '-Command', '$PSVersionTable.PSVersion.ToString()'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('PowerShell archive was extracted but the pwsh executable could not start.');
  }
  return executable;
}

async function serverResponds() {
  try {
    const response = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(2_000) });
    return response.ok || response.status < 500;
  } catch { return false; }
}

async function ensureServer() {
  if (await serverResponds()) {
    console.log('Reusing the application already running on http://localhost:3000.');
    return;
  }
  console.log('Starting the Next.js development server on port 3000...');
  server = spawn('npm', ['run', 'dev', '--', '--port', '3000'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  server.stdout?.on('data', chunk => process.stdout.write(`[server] ${chunk}`));
  server.stderr?.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
  for (let attempt = 0; attempt < 90; attempt++) {
    if (await serverResponds()) return;
    if (server.exitCode !== null) throw new Error(`Development server exited with code ${server.exitCode}`);
    await delay(1_000);
  }
  throw new Error('Development server did not become ready within 90 seconds.');
}

async function postJson(pathname, body) {
  const apiKey = process.env.RECONCILIATION_API_KEY?.trim();
  if (!apiKey) throw new Error('RECONCILIATION_API_KEY is required to verify reconciliation endpoints.');
  const response = await fetch(`http://localhost:3000${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function positiveCounts(counts, names) {
  for (const name of names) {
    if (!Number.isFinite(counts?.[name]) || counts[name] <= 0) throw new Error(`Expected ${name} to be greater than zero; received ${counts?.[name] ?? 'missing'}.`);
  }
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-server.pid, 'SIGTERM');
    else server.kill('SIGTERM');
  } catch { server.kill('SIGTERM'); }
}

async function main() {
  console.log('Step 1/5: Checking whether app-only SharePoint access is already provisioned.');
  const alreadyProvisioned = await runReturningStatus('npm', ['run', 'test:sharepoint']);
  if (alreadyProvisioned) {
    console.log('The application already has verified SharePoint access; interactive administrator sign-in is not required.');
  } else {
    console.log('App-only access is not yet available. Ensuring Microsoft Graph PowerShell is installed.');
    const powerShell = await ensurePowerShell();
    console.log('Step 2/5: Provisioning and verifying the Sites.Selected site role.');
    await run(powerShell, ['-NoLogo', '-NoProfile', '-File', psScript]);
  }

  console.log('Step 3/5: Verifying app-only workbook downloads, parsers and PostgreSQL awards.');
  await run('npm', ['run', 'test:sharepoint', '--', '--download']);

  console.log('Step 4/5: Starting or reusing the application server.');
  await ensureServer();

  console.log('Step 5/5: Calling and validating both reconciliation APIs.');
  const sync = await postJson('/api/reconciliation/sync');
  if (sync.complete !== true) throw new Error(`Sync was incomplete: ${JSON.stringify(sync.issues ?? [])}`);
  positiveCounts(sync.counts, ['framework_rules', 'rebate_check_records', 'invoice_spend_records']);
  console.log(`Sync verified: rules=${sync.counts.framework_rules}, rebates=${sync.counts.rebate_check_records}, invoices=${sync.counts.invoice_spend_records}`);

  const reconciliation = await postJson('/api/reconciliation/run', {});
  if (reconciliation.complete !== true) throw new Error(`Reconciliation was incomplete: ${JSON.stringify(reconciliation.issues ?? [])}`);
  positiveCounts(reconciliation.inputs, ['external_awards', 'framework_rules', 'rebate_check_records', 'invoice_spend_records']);
  if (!Array.isArray(reconciliation.results)) throw new Error('Reconciliation response is missing results array.');
  console.log(`Reconciliation verified: external awards=${reconciliation.inputs.external_awards}, results=${reconciliation.results.length}`);
  console.log(`Findings: ${JSON.stringify(reconciliation.summary)}`);
  console.log('SHAREPOINT_RECONCILIATION_OPERATIONAL=true');
}

main()
  .catch(error => {
    console.error(`Provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(stopServer);
