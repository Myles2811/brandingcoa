$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$tenantId = '38c0960d-93be-4501-997d-b4ef907a2d8e'
$appId = 'dacca82c-5f1c-41fa-b903-dd966e63c09b'
$appDisplayName = 'REBATES reconciliation'
$siteAddress = 'neogenixltd.sharepoint.com:/sites/REBATES-TEST'
$connected = $false

function Ensure-GraphModule {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Module -ListAvailable -Name $Name)) {
        Write-Host "Installing $Name for the current user..."
        Install-Module $Name -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
    }
    Import-Module $Name -Force
}

try {
    if (-not (Get-PackageProvider -Name NuGet -ListAvailable -ErrorAction SilentlyContinue)) {
        Install-PackageProvider -Name NuGet -Scope CurrentUser -Force | Out-Null
    }
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    Ensure-GraphModule -Name Microsoft.Graph.Authentication
    Ensure-GraphModule -Name Microsoft.Graph.Sites

    Write-Host 'Opening Microsoft sign-in for delegated Sites.FullControl.All consent...'
    Connect-MgGraph -TenantId $tenantId -Scopes 'Sites.FullControl.All' -ContextScope Process -NoWelcome
    $connected = $true

    $context = Get-MgContext
    if (-not $context -or $context.TenantId -ne $tenantId) {
        throw "Microsoft Graph connected to the wrong tenant. Expected $tenantId."
    }
    if ($context.Scopes -notcontains 'Sites.FullControl.All') {
        throw 'The delegated session does not contain Sites.FullControl.All.'
    }
    Write-Host "Authenticated as $($context.Account) in tenant $($context.TenantId)."

    $site = Get-MgSite -SiteId $siteAddress -Property 'id,displayName,webUrl'
    if (-not $site.Id) { throw 'Unable to resolve the REBATES-TEST SharePoint site.' }
    Write-Host "Resolved site: $($site.DisplayName) ($($site.Id))"

    $permissions = @(Get-MgSitePermission -SiteId $site.Id -All)
    $existing = $permissions | Where-Object {
        $permission = $_
        @($permission.GrantedToIdentitiesV2) + @($permission.GrantedToIdentities) |
            Where-Object { $_.Application.Id -eq $appId }
    } | Select-Object -First 1

    if ($existing) {
        $usableRoles = @($existing.Roles | Where-Object { $_.ToLowerInvariant() -in @('read', 'write', 'fullcontrol', 'owner') })
        if ($usableRoles.Count -eq 0) {
            throw "An existing site permission for $appId has no usable role. Permission ID: $($existing.Id)"
        }
        Write-Host "Site permission already exists with role(s): $($existing.Roles -join ', ')"
    }
    else {
        $body = @{
            roles = @('read')
            grantedToIdentities = @(
                @{
                    application = @{
                        id = $appId
                        displayName = $appDisplayName
                    }
                }
            )
        }
        $created = New-MgSitePermission -SiteId $site.Id -BodyParameter $body
        Write-Host "Created site permission $($created.Id) with role(s): $($created.Roles -join ', ')"
    }

    Start-Sleep -Seconds 5
    $verified = @(Get-MgSitePermission -SiteId $site.Id -All) | Where-Object {
        $permission = $_
        $identityMatch = @($permission.GrantedToIdentitiesV2) + @($permission.GrantedToIdentities) |
            Where-Object { $_.Application.Id -eq $appId }
        $roleMatch = @($permission.Roles | Where-Object { $_.ToLowerInvariant() -in @('read', 'write', 'fullcontrol', 'owner') })
        $identityMatch -and $roleMatch
    } | Select-Object -First 1

    if (-not $verified) { throw 'Site permission verification failed after creation.' }
    Write-Host "Verified Sites.Selected site access for $appId with role(s): $($verified.Roles -join ', ')"
    Write-Output "PROVISIONED_SITE_ID=$($site.Id)"
}
finally {
    if ($connected) {
        try { Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null } catch { }
        Write-Host 'Disconnected the delegated Microsoft Graph administrator session.'
    }
}
