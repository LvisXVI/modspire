param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Encrypt', 'Decrypt')]
    [string] $Mode
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$inputText = [Console]::In.ReadToEnd()
if ($Mode -eq 'Encrypt') {
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($inputText)
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
        $plainBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
} else {
    $protectedBytes = [Convert]::FromBase64String($inputText.Trim())
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plainBytes))
}
