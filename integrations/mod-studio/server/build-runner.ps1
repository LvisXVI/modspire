param(
    [Parameter(Mandatory = $true)]
    [string] $GradlePath
)

$ErrorActionPreference = 'Stop'
& $GradlePath build --no-daemon --console=plain
exit $LASTEXITCODE
