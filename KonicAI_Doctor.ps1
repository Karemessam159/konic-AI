# Konic AI Doctor - run from the project root (PowerShell)
$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.Generic.List[object]
function Add-Check($name,$status,$details) {
  $results.Add([pscustomobject]@{ Check=$name; Status=$status; Details=$details })
  Write-Host "[$status] $name - $details"
}
$root = (Get-Location).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $root "KonicAI_Doctor_Report_$stamp.txt"
Write-Host "Konic AI Doctor | $root"
if (!(Test-Path 'package.json') -or !(Test-Path 'server/index.js')) {
  Write-Host 'ERROR: Open PowerShell in the KonicAI project root.'
  exit 1
}
foreach ($p in @('src/App.tsx','src/Chat.tsx','src/App.css','server/index.js','server/ai.js')) {
  if (Test-Path $p) { Add-Check "File: $p" 'PASS' 'Found' } else { Add-Check "File: $p" 'FAIL' 'Missing' }
}
if (Test-Path 'server/.env') {
  $envText = Get-Content 'server/.env' -Raw
  if ($envText -match '(?m)^\s*GROQ_API_KEY\s*=\s*[^\s#]+') {
    Add-Check 'Groq key configuration' 'PASS' 'Present (value hidden)'
  } else { Add-Check 'Groq key configuration' 'FAIL' 'Missing or empty' }
} else { Add-Check 'Environment configuration' 'FAIL' 'server/.env not found' }
try {
  $nodeVersion = (& node --version 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -eq 0) { Add-Check 'Node.js' 'PASS' $nodeVersion } else { Add-Check 'Node.js' 'FAIL' 'Node failed' }
} catch { Add-Check 'Node.js' 'FAIL' 'Not available' }
try {
  $buildOutput = & npm run build 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { Add-Check 'Frontend production build' 'PASS' 'Build completed' }
  else { Add-Check 'Frontend production build' 'FAIL' (($buildOutput -split "`n" | Select-Object -Last 8) -join ' ').Trim() }
} catch { Add-Check 'Frontend production build' 'FAIL' $_.Exception.Message }
try {
  $health = Invoke-RestMethod -Uri 'http://localhost:3001/' -Method Get -TimeoutSec 6
  Add-Check 'Backend HTTP 3001' 'PASS' 'Responding'
  $backendOK = $true
} catch {
  Add-Check 'Backend HTTP 3001' 'FAIL' 'Not responding. Start backend in another terminal.'
  $backendOK = $false
}
try {
  $front = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 6
  Add-Check 'Frontend HTTP 5173' 'PASS' "HTTP $($front.StatusCode)"
} catch { Add-Check 'Frontend HTTP 5173' 'WARN' 'Not responding. Start npm run dev in another terminal.' }
if ($backendOK) {
  $payload = @{ messages=@(@{ role='user'; text='Reply with exactly: OK' }) } | ConvertTo-Json -Depth 6 -Compress
  try {
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $reply = Invoke-RestMethod -Uri 'http://localhost:3001/api/chat' -Method POST -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 75
    $timer.Stop()
    if ($reply.reply -or $reply.text) { Add-Check 'Groq live request' 'PASS' "Reply received in $([math]::Round($timer.Elapsed.TotalSeconds,1)) sec" }
    else { Add-Check 'Groq live request' 'WARN' 'HTTP success but reply format unexpected' }
  } catch {
    $status = ''
    if ($_.Exception.Response) { $status = [string][int]$_.Exception.Response.StatusCode }
    $reason = if ($status) { "HTTP $status" } else { $_.Exception.Message }
    Add-Check 'Groq live request' 'FAIL' $reason
  }
} else { Add-Check 'Groq live request' 'SKIP' 'Backend unavailable' }
$counts = ($results | Group-Object Status | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join '; '
$results | Format-Table -AutoSize | Out-String -Width 220 | Set-Content -Path $report -Encoding UTF8
Add-Content -Path $report -Value "`nSummary: $counts" -Encoding UTF8
Write-Host "`nSummary: $counts"
Write-Host "Report saved: $report"
Write-Host 'NOTE: A PASS does not certify production security, file uploads, mobile readiness, or model failover.'
