param(
    [Parameter(Mandatory=$true)][string]$Video,
    [ValidateRange(1,60)][int]$ClipSeconds=30,
    [ValidateSet(252,336,518)][int]$ImageSize=252,
    [ValidateSet(1,2,4)][int]$Fps=1,
    [ValidateSet('fast','detailed')][string]$Profile='fast'
)
$ErrorActionPreference='Stop'
$taskVideo=(Resolve-Path -LiteralPath $Video).Path
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskPython=Join-Path $taskRoot '.local/mapping-venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $taskPython)) {throw 'Run scripts/setup-mapping.ps1 first.'}
& $taskPython experiments/lingbot-map/export_map.py --video $taskVideo --repo .local/lingbot-map --weights .local/lingbot-map.pt --output .local/housekeeping-map.json --image-size $ImageSize --fps $Fps --clip-seconds $ClipSeconds --profile $Profile
if ($LASTEXITCODE) {throw 'Mapping failed. Close GPU-heavy apps and retry a shorter segment.'}
Write-Host 'Import .local/housekeeping-map.json in the app experimental mapping panel. The benchmark is alongside it.'
