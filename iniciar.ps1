$ErrorActionPreference = 'Stop'
$agendaPython = $null
$agendaCandidates = @()
foreach ($agendaCommand in @('python', 'python3', 'py')) {
    $agendaFound = Get-Command $agendaCommand -ErrorAction SilentlyContinue
    if ($agendaFound -and $agendaFound.Source -notlike '*\WindowsApps\*') {
        $agendaCandidates += $agendaFound.Source
    }
}
$agendaCandidates += @(
    "$env:LOCALAPPDATA\Programs\pgAdmin 4\python\python.exe",
    "$env:ProgramFiles\pgAdmin 4\python\python.exe"
)
$agendaPythonDirectories = Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\Programs\Python" -Directory -ErrorAction SilentlyContinue
foreach ($agendaDirectory in $agendaPythonDirectories) {
    $agendaCandidates += Join-Path $agendaDirectory.FullName 'python.exe'
}
foreach ($agendaCandidate in $agendaCandidates) {
    if (Test-Path -LiteralPath $agendaCandidate) {
        $agendaPython = $agendaCandidate
        break
    }
}
if (-not $agendaPython) {
    Write-Host 'No se encontro Python 3. Instala Python 3 y vuelve a ejecutar INICIAR.cmd.' -ForegroundColor Yellow
    exit 1
}
Write-Host 'Abre http://localhost:8000 en tu navegador.' -ForegroundColor Cyan
Write-Host 'Deja esta ventana abierta mientras usas la agenda.'
& $agendaPython (Join-Path $PSScriptRoot 'servidor.py')
exit $LASTEXITCODE
