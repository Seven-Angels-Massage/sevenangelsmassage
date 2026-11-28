#requires -Version 5.1
<#
.SYNOPSIS
Creates an apex-AAAA-only deSEC token and stores it as a GitHub Actions secret.
.DESCRIPTION
Requires GitHub CLI (gh), an authenticated repository administrator, and a new
temporary deSEC token with "Can manage tokens" enabled. Enter that secret only
at the masked prompt. Never paste it into this file, a command argument, or chat.

The Cloudflare Worker exclusion must already be deployed and verified. This
helper asserts that ownership guard, sets observe mode, and never writes DNS or
starts a workflow. It refuses to replace an existing repository secret.

deSEC's auto_policy=true creates the default-deny policy atomically. The helper
then permits only sevenangelsmassage.com / empty subname / AAAA writes. Read
access remains available under deSEC's API rules. Delete the temporary setup
token in https://desec.io/tokens after success.

Run from Windows PowerShell after `gh auth login`, for example:
  .\Set-DeSECSecret.ps1
Documentation: https://desec.readthedocs.io/en/latest/auth/tokens.html
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'Seven-Angels-Massage/sevenangelsmassage'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$secretName = 'DESEC_APEX_AAAA_TOKEN'
$domain = 'sevenangelsmassage.com'
$ghPath = $null
$newTokenId = $null
$managementHeaders = $null
$secureInput = $null
$bstr = [IntPtr]::Zero
$secretWriteAttempted = $false
$secretConfirmed = $false
$variablesVerified = $false
$modeWriteAttempted = $false
$modeVerified = $false
$stage = 'GitHub preflight'
$oldTls = [Net.ServicePointManager]::SecurityProtocol

function Invoke-GitHub {
    param([string[]]$ArgumentList, [string]$InputValue = '')
    # All arguments are fixed words or the validated owner/repository; secrets
    # are sent only through stdin. No shell is involved.
    if (@($ArgumentList | Where-Object { $_ -match '[\s"]' }).Count) {
        throw 'An unexpected GitHub argument was rejected.'
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $ghPath
    $process.StartInfo.Arguments = $ArgumentList -join ' '
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.EnvironmentVariables.Remove('GH_DEBUG')
    $process.StartInfo.EnvironmentVariables['GH_HOST'] = 'github.com'
    $process.StartInfo.EnvironmentVariables['GH_PROMPT_DISABLED'] = '1'
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($InputValue)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(60000)) {
            $process.Kill()
            throw 'GitHub CLI timed out; the remote outcome may be unknown.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'GitHub CLI failed. Its output is withheld to protect credentials.'
        }
        return $stdout.Result.Trim()
    } finally {
        $process.Dispose()
    }
}

function Invoke-DeSEC {
    param([string]$Method, [string]$Path, [hashtable]$Headers, $Body = $null)
    $request = @{
        Method = $Method; Uri = "https://desec.io/api/v1/$Path"
        Headers = $Headers; TimeoutSec = 30; MaximumRedirection = 0; ErrorAction = 'Stop'
        Verbose = $false; Debug = $false
    }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 5 -Compress
    }
    try { return Invoke-RestMethod @request }
    catch { throw "deSEC $Method request failed. Response details are withheld." }
}

function Assert-SecretAbsent {
    $names = Invoke-GitHub -ArgumentList @('secret', 'list', '--repo', $Repository, '--json', 'name', '--jq', '.[].name')
    if (($names -split '\r?\n') -contains $secretName) {
        throw "$secretName already exists. This helper will not replace it."
    }
}

try {
    $ghPath = (Get-Command gh -CommandType Application -ErrorAction Stop).Source
    $null = Invoke-GitHub -ArgumentList @('auth', 'status', '--hostname', 'github.com')
    $admin = Invoke-GitHub -ArgumentList @('api', "repos/$Repository", '--jq', '.permissions.admin')
    if ($admin -ne 'true') { throw 'The authenticated GitHub account must administer this repository.' }
    $private = Invoke-GitHub -ArgumentList @('api', "repos/$Repository", '--jq', '.private')
    if ($private -ne 'false') { throw 'A public repository is required for this setup using free standard runners.' }
    Assert-SecretAbsent
    $stage = 'setting observation mode'
    $modeWriteAttempted = $true
    $null = Invoke-GitHub -ArgumentList @('variable', 'set', 'APEX_AAAA_MODE', '--body', 'observe', '--repo', $Repository)
    $mode = Invoke-GitHub -ArgumentList @('variable', 'get', 'APEX_AAAA_MODE', '--repo', $Repository)
    if ($mode -ne 'observe') { throw 'GitHub observation mode could not be verified.' }
    $modeVerified = $true
    $stage = 'creating and restricting the deSEC token'
    [Net.ServicePointManager]::SecurityProtocol = $oldTls -bor [Net.SecurityProtocolType]::Tls12
    $secureInput = Read-Host 'Temporary deSEC management token secret (hidden)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
    $managementHeaders = @{ Authorization = 'Token ' + [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $bstr = [IntPtr]::Zero
    $metadata = Invoke-DeSEC -Method GET -Path "domains/$domain/" -Headers $managementHeaders
    if ($metadata.name -cne $domain) { throw 'deSEC did not return the expected domain.' }
    $created = Invoke-DeSEC -Method POST -Path 'auth/tokens/' -Headers $managementHeaders -Body @{
        name = 'SAM apex AAAA controller'; auto_policy = $true
        perm_create_domain = $false; perm_delete_domain = $false; perm_manage_tokens = $false
    }
    $candidateTokenId = [string]$created.id
    if ($candidateTokenId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
        throw 'deSEC did not return a valid new token ID; inspect the Tokens dashboard.'
    }
    $newTokenId = $candidateTokenId
    if ([string]::IsNullOrWhiteSpace($created.token)) { throw 'deSEC did not return the new token secret.' }
    $policyPath = "auth/tokens/$newTokenId/policies/rrsets/"
    $initial = @(Invoke-DeSEC -Method GET -Path $policyPath -Headers $managementHeaders)
    if ($initial.Count -ne 1 -or $null -ne $initial[0].domain -or $null -ne $initial[0].subname -or
        $null -ne $initial[0].type -or $initial[0].perm_write -ne $false) {
        throw 'The new token did not have the expected default-deny policy.'
    }
    $null = Invoke-DeSEC -Method POST -Path $policyPath -Headers $managementHeaders -Body @{
        domain = $domain; subname = ''; type = 'AAAA'; perm_write = $true
    }
    $policies = @(Invoke-DeSEC -Method GET -Path $policyPath -Headers $managementHeaders)
    $denies = @($policies | Where-Object { $null -eq $_.domain -and $null -eq $_.subname -and $null -eq $_.type -and $_.perm_write -eq $false })
    $allows = @($policies | Where-Object { $_.domain -ceq $domain -and $_.subname -ceq '' -and $_.type -ceq 'AAAA' -and $_.perm_write -eq $true })
    $details = Invoke-DeSEC -Method GET -Path "auth/tokens/$newTokenId/" -Headers $managementHeaders
    if ($policies.Count -ne 2 -or $denies.Count -ne 1 -or $allows.Count -ne 1 -or
        $details.perm_create_domain -ne $false -or $details.perm_delete_domain -ne $false -or
        $details.perm_manage_tokens -ne $false -or $details.auto_policy -ne $true) {
        throw 'The new token failed the exact-scope verification.'
    }
    $restrictedHeaders = @{ Authorization = 'Token ' + $created.token }
    $verifiedDomain = Invoke-DeSEC -Method GET -Path "domains/$domain/" -Headers $restrictedHeaders
    if ($verifiedDomain.name -cne $domain) { throw 'The restricted token could not read the expected domain.' }
    $stage = 'storing the restricted token in GitHub'
    Assert-SecretAbsent
    $secretWriteAttempted = $true
    $null = Invoke-GitHub -ArgumentList @('secret', 'set', $secretName, '--repo', $Repository) -InputValue $created.token
    $names = Invoke-GitHub -ArgumentList @('secret', 'list', '--repo', $Repository, '--json', 'name', '--jq', '.[].name')
    if (($names -split '\r?\n') -notcontains $secretName) { throw 'GitHub secret storage could not be confirmed.' }
    $secretConfirmed = $true
    $stage = 'setting the verified ownership guard'
    $null = Invoke-GitHub -ArgumentList @('variable', 'set', 'EXCLUSIVE_APEX_AAAA_OWNER', '--body', 'true', '--repo', $Repository)
    $owner = Invoke-GitHub -ArgumentList @('variable', 'get', 'EXCLUSIVE_APEX_AAAA_OWNER', '--repo', $Repository)
    $mode = Invoke-GitHub -ArgumentList @('variable', 'get', 'APEX_AAAA_MODE', '--repo', $Repository)
    if ($owner -ne 'true' -or $mode -ne 'observe') { throw 'GitHub repository variables could not be verified.' }
    $variablesVerified = $true
    Write-Host "Stored $secretName in $Repository. deSEC token ID: $newTokenId"
    Write-Host "Write scope: $domain apex AAAA only. Minimum TTL: $($verifiedDomain.minimum_ttl) seconds."
    Write-Host 'APEX_AAAA_MODE=observe; EXCLUSIVE_APEX_AAAA_OWNER=true. No DNS changes or workflows were requested.'
    Write-Host 'Delete the temporary management token at https://desec.io/tokens.'
} catch {
    Write-Warning "Setup stopped during $stage. $($_.Exception.Message)"
    if ($newTokenId -and $secretConfirmed) {
        Write-Warning "The GitHub secret is stored and deSEC token $newTokenId remains valid. Do not rerun token creation."
        Write-Warning 'Complete or verify EXCLUSIVE_APEX_AAAA_OWNER=true and APEX_AAAA_MODE=observe in repository variables.'
    } elseif ($newTokenId -and $secretWriteAttempted) {
        Write-Warning "GitHub storage may have succeeded. Token $newTokenId remains valid; it was NOT revoked."
        Write-Warning "Check $Repository Actions secrets before retrying. If abandoning setup, remove that secret and revoke this new token explicitly."
    } elseif ($newTokenId -and $managementHeaders) {
        try {
            $null = Invoke-DeSEC -Method DELETE -Path "auth/tokens/$newTokenId/" -Headers $managementHeaders
            Write-Warning "Revoked only the newly created deSEC token $newTokenId; no secret was submitted to GitHub."
        } catch { Write-Warning "Could not confirm revocation. Delete new token $newTokenId in the deSEC Tokens dashboard." }
    }
    if ($variablesVerified) { Write-Warning 'Repository variables remain observe mode and exclusive ownership=true.' }
    elseif ($modeVerified) { Write-Warning 'Observe mode was verified before token creation; inspect repository variables if setup stopped later.' }
    elseif ($modeWriteAttempted) { Write-Warning 'Repository variable changes were attempted; inspect their values before continuing.' }
    throw 'Setup did not finish. No DNS changes or workflow dispatches were requested.'
} finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($null -ne $secureInput) { $secureInput.Dispose() }
    $managementHeaders = $null; $restrictedHeaders = $null; $created = $null
    [Net.ServicePointManager]::SecurityProtocol = $oldTls
}
