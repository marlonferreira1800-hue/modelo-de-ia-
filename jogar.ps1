# ULTRA 64 Cloud Deck - Inicializador Automatico Windows PowerShell
$ErrorActionPreference = "SilentlyContinue"
$workdir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $workdir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  ULTRA 64 CLOUD DECK - PROCURANDO MARIO KART 64... " -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

$downloads = Join-Path $env:USERPROFILE "Downloads"
$romFile = Get-ChildItem -Path $downloads -Recurse -File | Where-Object {
    ($_.Name -like "*Mario Kart 64*") -and ($_.Extension -in @(".z64", ".n64", ".v64", ".zip", ".rom"))
} | Select-Object -First 1

if (-not $romFile) {
    $folderPath = Join-Path $downloads "Mario Kart 64 (Europe)"
    if (Test-Path $folderPath) {
        $romFile = Get-ChildItem -Path $folderPath -Recurse -File | Select-Object -First 1
    }
}

$queryParam = ""
if ($romFile) {
    $destName = "mariokart64" + $romFile.Extension
    $destPath = Join-Path $workdir $destName
    Copy-Item -Path $romFile.FullName -Destination $destPath -Force
    Write-Host "[OK] ROM Encontrada: $($romFile.FullName)" -ForegroundColor Green
    $queryParam = "?rom=$destName"
} else {
    Write-Host "[AVISO] Arraste o arquivo da ROM na janela do navegador que vai abrir!" -ForegroundColor Yellow
}

$port = 8080
$url = "http://localhost:$port/$queryParam"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "[OK] Servidor Nintendo 64 rodando em: $url" -ForegroundColor Green
Write-Host "Abrindo navegador... (Pressione Ctrl+C para encerrar)" -ForegroundColor Cyan
Start-Process $url

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

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
