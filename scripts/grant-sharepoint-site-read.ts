/**
 * One-time Sites.Selected provisioning script.
 *
 * The administrator token is deliberately not loaded from .env.local by the npm command.
 * Supply it only for this process:
 *   GRAPH_ADMIN_BEARER_TOKEN='...' npm run grant:sharepoint
 *
 * The delegated token must contain Sites.FullControl.All and its user must be a
 * SharePoint Administrator or Global Administrator. The target application must
 * already have Microsoft Graph Sites.Selected (Application) with admin consent.
 */

const TARGET_APP_ID = 'dacca82c-5f1c-41fa-b903-dd966e63c09b';
const TARGET_APP_NAME = 'REBATES reconciliation';
const HOSTNAME = 'neogenixltd.sharepoint.com';
const SITE_PATH = '/sites/REBATES-TEST';

interface SitePermission {
  id?: string;
  roles?: string[];
  grantedToIdentitiesV2?: Array<{ application?: { id?: string; displayName?: string } }>;
  grantedToIdentities?: Array<{ application?: { id?: string; displayName?: string } }>;
}

function adminToken(): string {
  const value = process.env.GRAPH_ADMIN_BEARER_TOKEN?.trim();
  if (!value) {
    throw new Error(
      "Missing GRAPH_ADMIN_BEARER_TOKEN. Obtain a delegated Microsoft Graph token with Sites.FullControl.All, then run: GRAPH_ADMIN_BEARER_TOKEN='...' npm run grant:sharepoint",
    );
  }
  return value.replace(/^Bearer\s+/i, '');
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
      Authorization: `Bearer ${adminToken()}`,
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Graph ${init.method ?? 'GET'} ${path} failed (${response.status}): ${body}`);
  }
  return response;
}

function permissionAppId(permission: SitePermission): string | undefined {
  return permission.grantedToIdentitiesV2?.[0]?.application?.id
    ?? permission.grantedToIdentities?.[0]?.application?.id;
}

async function main() {
  const siteResponse = await graph(`/sites/${HOSTNAME}:${SITE_PATH}?$select=id,displayName,webUrl`);
  const site = await siteResponse.json() as { id?: string; displayName?: string; webUrl?: string };
  if (!site.id) throw new Error('Site resolution returned no ID');
  console.log(`Resolved site: ${site.displayName ?? SITE_PATH} (${site.id})`);

  const currentResponse = await graph(`/sites/${encodeURIComponent(site.id)}/permissions`);
  const current = ((await currentResponse.json()) as { value?: SitePermission[] }).value ?? [];
  const existing = current.find(permission => permissionAppId(permission)?.toLowerCase() === TARGET_APP_ID.toLowerCase());
  if (existing) {
    console.log(`Application already has site role(s): ${(existing.roles ?? []).join(', ') || '(unspecified)'}`);
    if ((existing.roles ?? []).some(role => ['read', 'write', 'fullcontrol', 'owner'].includes(role.toLowerCase()))) return;
    throw new Error('An application permission exists but has no usable role; inspect it before changing access.');
  }

  const grantResponse = await graph(`/sites/${encodeURIComponent(site.id)}/permissions`, {
    method: 'POST',
    body: JSON.stringify({
      roles: ['read'],
      grantedToIdentities: [{ application: { id: TARGET_APP_ID, displayName: TARGET_APP_NAME } }],
    }),
  });
  const created = await grantResponse.json() as SitePermission;
  console.log(`Granted application ${TARGET_APP_ID} role(s): ${(created.roles ?? []).join(', ')}`);
  console.log('Site permission provisioning completed. Wait briefly for propagation, then run npm run test:sharepoint -- --download.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
