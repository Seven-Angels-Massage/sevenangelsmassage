# Credential-free functional checks. Every GitHub/deSEC operation is mocked.
# Run with pwsh on a GitHub Ubuntu runner, where gh exists for discovery only.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$helperPath = Join-Path $PSScriptRoot 'Set-DeSECSecret.ps1'
$source = [IO.File]::ReadAllText($helperPath)
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Production helper has PowerShell parse errors.' }
$ioFunctions = @($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-GitHub'
}, $true))
if ($ioFunctions.Count -ne 1) { throw 'Expected exactly one Invoke-GitHub function.' }
# Only this I/O implementation is removed. All setup/cleanup decisions remain.
$extent = $ioFunctions[0].Extent
$script:HelperBlock = [ScriptBlock]::Create($source.Remove($extent.StartOffset, $extent.EndOffset - $extent.StartOffset))
$script:Repository = 'Seven-Angels-Massage/sevenangelsmassage'
$script:FakeManagement = 'FAKE-MANAGEMENT-SECRET-ONLY-FOR-TEST'
$script:FakeChild = 'FAKE-RESTRICTED-SECRET-ONLY-FOR-TEST'
$script:NewId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $script:State.AssertionFailures++; throw "Assertion failed: $Message" }
}
function Reject-Unexpected {
    $script:State.Unexpected++
    throw 'Unexpected mocked operation: no external call was made.'
}
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    Assert-True $AsSecureString.IsPresent 'Management input must use the masked prompt.'
    $script:State.Prompts++
    return ConvertTo-SecureString $script:FakeManagement -AsPlainText -Force
}
function Invoke-GitHub {
    param([string[]]$ArgumentList, [string]$InputValue = '')
    Assert-True (-not (($ArgumentList -join ' ').Contains($script:FakeChild))) 'No secret in GitHub arguments.'
    $operation = $ArgumentList[0] + ' ' + $ArgumentList[1]
    switch ($operation) {
        'auth status' { return '' }
        "api repos/$script:Repository" {
            switch ($ArgumentList[-1]) {
                '.permissions.admin' { return 'true' }
                '.private' { return 'false' }
                default { Reject-Unexpected }
            }
        }
        'secret list' {
            if ($script:State.SecretStored) { return 'DESEC_APEX_AAAA_TOKEN' }
            return ''
        }
        'secret set' {
            Assert-True ($ArgumentList[2] -ceq 'DESEC_APEX_AAAA_TOKEN') 'Only the dedicated secret may be stored.'
            Assert-True ($InputValue -ceq $script:FakeChild) 'Only the restricted token goes to stdin.'
            $script:State.SecretSubmissions++
            $script:State.SecretStored = $true
            if ($script:Case -eq 'ambiguous') { throw 'Simulated GitHub result unknown after submission.' }
            return ''
        }
        'variable set' {
            $name = $ArgumentList[2]; $value = $ArgumentList[4]
            if ($name -eq 'APEX_AAAA_MODE') {
                Assert-True ($value -ceq 'observe') 'Setup must select observation mode.'
                if ($script:Case -eq 'observe-failure') { throw 'Simulated observation variable failure.' }
            } elseif ($name -eq 'EXCLUSIVE_APEX_AAAA_OWNER') {
                Assert-True ($script:State.SecretStored -and $value -ceq 'true') 'Ownership follows confirmed storage.'
            } else { Reject-Unexpected }
            $script:State.Variables[$name] = $value
            return ''
        }
        'variable get' { return $script:State.Variables[$ArgumentList[2]] }
        default { Reject-Unexpected }
    }
}
function Invoke-RestMethod {
    [CmdletBinding()]
    param([string]$Method, [uri]$Uri, [hashtable]$Headers, $Body = $null,
          [int]$TimeoutSec, [int]$MaximumRedirection, [string]$ContentType)
    Assert-True ($Uri.Scheme -eq 'https' -and $Uri.Host -eq 'desec.io') 'Only the deSEC HTTPS API is expected.'
    Assert-True ($MaximumRedirection -eq 0 -and $TimeoutSec -eq 30) 'Requests must be bounded and reject redirects.'
    Assert-True ($Headers.Authorization -ceq ('Token ' + $script:FakeManagement) -or $Headers.Authorization -ceq ('Token ' + $script:FakeChild)) 'Only fake credentials may reach mocks.'
    $path = $Uri.AbsolutePath -replace '^/api/v1/', ''
    $data = if ($null -ne $Body) { $Body | ConvertFrom-Json } else { $null }
    [void]$script:State.Calls.Add([pscustomobject]@{ Method = $Method; Path = $path })
    switch ("$Method $path") {
        'GET domains/sevenangelsmassage.com/' {
            return [pscustomobject]@{ name = 'sevenangelsmassage.com'; minimum_ttl = 900 }
        }
        'POST auth/tokens/' {
            Assert-True ($script:State.Variables['APEX_AAAA_MODE'] -ceq 'observe') 'Observe must be set before minting.'
            Assert-True ($data.auto_policy -eq $true) 'Default-deny must be created atomically.'
            Assert-True (-not $data.perm_create_domain -and -not $data.perm_delete_domain -and -not $data.perm_manage_tokens) 'New token must lack administration rights.'
            $script:State.Created++
            return [pscustomobject]@{ id = $script:NewId; token = $script:FakeChild }
        }
        "GET auth/tokens/$script:NewId/policies/rrsets/" {
            $deny = [pscustomobject]@{ domain = $null; subname = $null; type = $null; perm_write = $false }
            if (-not $script:State.PolicyCreated) { return $deny }
            $subname = if ($script:Case -eq 'bad-scope') { 'www' } else { '' }
            return @($deny, [pscustomobject]@{ domain = 'sevenangelsmassage.com'; subname = $subname; type = 'AAAA'; perm_write = $true })
        }
        "POST auth/tokens/$script:NewId/policies/rrsets/" {
            Assert-True ($data.domain -ceq 'sevenangelsmassage.com' -and $data.subname -ceq '' -and $data.type -ceq 'AAAA' -and $data.perm_write -eq $true) 'Only apex AAAA may be granted.'
            $script:State.PolicyCreated = $true
            return $null
        }
        "GET auth/tokens/$script:NewId/" {
            return [pscustomobject]@{ perm_create_domain = $false; perm_delete_domain = $false; perm_manage_tokens = $false; auto_policy = $true }
        }
        "DELETE auth/tokens/$script:NewId/" { $script:State.Revoked++; return $null }
        default { Reject-Unexpected }
    }
}

foreach ($caseName in @('success', 'bad-scope', 'ambiguous', 'observe-failure')) {
    $script:Case = $caseName
    $script:State = @{
        Variables = @{}; Calls = [System.Collections.Generic.List[object]]::new()
        Created = 0; Revoked = 0; Prompts = 0; Unexpected = 0; AssertionFailures = 0
        SecretStored = $false; SecretSubmissions = 0; PolicyCreated = $false
    }
    $captured = [System.Collections.Generic.List[object]]::new()
    $failed = $false
    try { & $script:HelperBlock -Repository $script:Repository *>&1 | ForEach-Object { [void]$captured.Add($_) } }
    catch { $failed = $true; [void]$captured.Add($_) }
    $output = $captured | Out-String
    Assert-True ($script:State.AssertionFailures -eq 0) "$caseName must not swallow a mock assertion failure."
    Assert-True (-not $output.Contains($script:FakeManagement) -and -not $output.Contains($script:FakeChild)) "$caseName must never print plaintext secrets."
    Assert-True ($script:State.Unexpected -eq 0) "$caseName must use only expected mocked operations."
    $dnsWrites = @($script:State.Calls | Where-Object { $_.Path -like 'domains/*' -and $_.Method -ne 'GET' })
    Assert-True ($dnsWrites.Count -eq 0) "$caseName must never write DNS."
    switch ($caseName) {
        'success' {
            Assert-True (-not $failed -and $script:State.Created -eq 1 -and $script:State.Revoked -eq 0) 'Successful setup retains exactly its new token.'
            Assert-True ($script:State.SecretSubmissions -eq 1 -and $script:State.Variables['APEX_AAAA_MODE'] -ceq 'observe' -and $script:State.Variables['EXCLUSIVE_APEX_AAAA_OWNER'] -ceq 'true') 'Success stores one secret with safe variables.'
        }
        'bad-scope' {
            Assert-True ($failed -and $script:State.Created -eq 1 -and $script:State.Revoked -eq 1 -and $script:State.SecretSubmissions -eq 0) 'Bad scope revokes only the newly created token before secret submission.'
            $deletes = @($script:State.Calls | Where-Object { $_.Method -eq 'DELETE' })
            Assert-True ($deletes.Count -eq 1 -and $deletes[0].Path -ceq "auth/tokens/$script:NewId/") 'Cleanup targets exactly the new token ID.'
            Assert-True ($output -match 'Revoked only the newly created') 'Cleanup must be explicitly reported.'
        }
        'ambiguous' {
            Assert-True ($failed -and $script:State.Created -eq 1 -and $script:State.Revoked -eq 0 -and $script:State.SecretSubmissions -eq 1) 'Unknown GitHub result must retain the potentially stored token.'
            Assert-True ($output -match 'storage may have succeeded' -and $output -match 'NOT revoked') 'Ambiguous storage must be explicitly reported.'
        }
        'observe-failure' {
            Assert-True ($failed -and $script:State.Created -eq 0 -and $script:State.Revoked -eq 0 -and $script:State.SecretSubmissions -eq 0 -and $script:State.Prompts -eq 0) 'Observation-mode failure must stop before credential input or minting.'
        }
    }
    Write-Host "PASS: $caseName (mocked; no external operations)"
}
Write-Host 'All four deSEC setup-helper scenarios passed.'
