# ULTRA 64 Cloud Deck - Instalador e Inicializador 1-Clique Windows PowerShell
$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$workdir = Join-Path $env:USERPROFILE "Ultra64_N64"
New-Item -ItemType Directory -Force -Path $workdir | Out-Null
Set-Location $workdir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  BAIXANDO CONSOLE NINTENDO 64 (ULTRA 64 DECK)...   " -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

$baseUrl = "https://raw.githubusercontent.com/marlonferreira1800-hue/modelo-de-ia-/main"
foreach ($f in @("index.html", "index.css", "app.js")) {
    Invoke-WebRequest -Uri "$baseUrl/$f" -OutFile (Join-Path $workdir $f) -UseBasicParsing
}

Write-Host "[OK] Arquivos do emulador prontos em $workdir" -ForegroundColor Green
Write-Host "Procurando Mario Kart 64 (Europe) em Downloads..." -ForegroundColor Yellow

$downloads = Join-Path $env:USERPROFILE "Downloads"
$romFile = Get-ChildItem -Path $downloads -Recurse -File | Where-Object {
    ($_.Name -like "*Mario Kart*") -and ($_.Extension -in @(".z64", ".n64", ".v64", ".zip", ".rom", ".7z"))
} | Select-Object -First 1

if (-not $romFile) {
    $folderPath = Join-Path $downloads "Mario Kart 64 (Europe)"
    if (Test-Path $folderPath) {
        if ((Get-Item $folderPath) -is [System.IO.DirectoryInfo]) {
            $romFile = Get-ChildItem -Path $folderPath -Recurse -File | Select-Object -First 1
        } else {
            $romFile = Get-Item $folderPath
        }
    }
}

$queryParam = ""
if ($romFile) {
    $ext = if ($romFile.Extension) { $romFile.Extension } else { ".z64" }
    $destName = "mariokart64" + $ext
    $destPath = Join-Path $workdir $destName
    Copy-Item -Path $romFile.FullName -Destination $destPath -Force
    Write-Host "[OK] ROM Mario Kart 64 encontrada: $($romFile.FullName)" -ForegroundColor Green
    $queryParam = "?rom=$destName"
} else {
    Write-Host "[AVISO] Nao achei automaticamente em Downloads. Arraste a ROM na tela do navegador!" -ForegroundColor Yellow
}

$port = 8085
$url = "http://localhost:$port/$queryParam"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "====================================================" -ForegroundColor Green
Write-Host "  ABRINDO NINTENDO 64 EM: $url" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Start-Process $url

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    $res.Headers.Add("Access-Control-Allow-Origin", "*")

    $localPath = $req.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($localPath)) { $localPath = "index.html" }
    $filePath = Join-Path $workdir $localPath

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        switch ($ext) {
            ".html" { $res.ContentType = "text/html; charset=utf-8" }
            ".css"  { $res.ContentType = "text/css; charset=utf-8" }
            ".js"   { $res.ContentType = "application/javascript; charset=utf-8" }
            ".json" { $res.ContentType = "application/json" }
            default { $res.ContentType = "application/octet-stream" }
        }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.OutputStream.Close()
}
