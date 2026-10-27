param(
  [string]$BaseUrl,
  [string]$AccessToken = $env:INSFORGE_ACCESS_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $BaseUrl) {
  $projectPath = Join-Path $PSScriptRoot "..\.insforge\project.json"
  $BaseUrl = (Get-Content $projectPath -Raw | ConvertFrom-Json).oss_host
}
if (-not $AccessToken) {
  throw "Set INSFORGE_ACCESS_TOKEN to a signed-in user's access token."
}

$headers = @{ Authorization = "Bearer $AccessToken" }
$text = Get-Content (Join-Path $PSScriptRoot "rag-sample.txt") -Raw
$ingestBody = @{ text = $text; source = "examples/rag-sample.txt" } | ConvertTo-Json -Compress
$ingestion = Invoke-RestMethod `
  -Uri "$BaseUrl/functions/ingest" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $ingestBody

$knownBody = @{ question = "¿Qué función cumplen las raíces aéreas de los manglares?" } | ConvertTo-Json -Compress
$knownAnswer = Invoke-RestMethod `
  -Uri "$BaseUrl/functions/ask" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $knownBody

$unknownBody = @{ question = "¿En qué año se declaró la independencia de Ecuador?" } | ConvertTo-Json -Compress
$unknownAnswer = Invoke-RestMethod `
  -Uri "$BaseUrl/functions/ask" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $unknownBody

[PSCustomObject]@{
  Ingestion = $ingestion
  InContextAnswer = $knownAnswer
  OutOfContextAnswer = $unknownAnswer
}
