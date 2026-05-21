# Static HTTP server for intro.html (no Node/npm required).
# Usage: right-click > Run with PowerShell, or:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\serve-intro.ps1

$ErrorActionPreference = "Stop"
$port = 8787
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".svg"  = "image/svg+xml"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".ico"  = "image/x-icon"
  ".json" = "application/json; charset=utf-8"
}

function Resolve-SafePath {
  param([string]$Relative)
  $clean = ($Relative -replace "/", [IO.Path]::DirectorySeparatorChar).TrimStart([IO.Path]::DirectorySeparatorChar)
  if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
  if ($clean -match '\.\.') { return $null }
  $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $clean))
  $rootPrefix = if ($root.EndsWith([IO.Path]::DirectorySeparatorChar)) { $root } else { $root + [IO.Path]::DirectorySeparatorChar }
  if ($full -ne $root -and -not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $full
}

$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not bind $prefix" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "If Windows blocked the URL, run once in an elevated CMD (admin):" -ForegroundColor Yellow
  Write-Host "  netsh http add urlacl url=$prefix user=$env:USERNAME" -ForegroundColor Gray
  exit 1
}

$url = "${prefix}intro.html"
Write-Host ""
Write-Host "  Serving:  $root" -ForegroundColor Cyan
Write-Host "  Open:     $url" -ForegroundColor Green
Write-Host "  Stop:     Ctrl+C" -ForegroundColor Yellow
Write-Host ""

try {
  Start-Process $url
} catch {
  # Browser launch can fail in some environments; URL is still printed.
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $res.Headers.Add("Cache-Control", "no-store")

  try {
    if ($req.HttpMethod -ne "GET" -and $req.HttpMethod -ne "HEAD") {
      $res.StatusCode = 405
      $res.Close()
      continue
    }

    $rel = $req.Url.AbsolutePath.TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($rel)) {
      $rel = "intro.html"
    }

    $path = Resolve-SafePath $rel
    if ($null -eq $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $res.ContentLength64 = $msg.Length
      if ($req.HttpMethod -eq "GET") {
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
      $res.Close()
      continue
    }

    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    $type = $mime[$ext]
    if (-not $type) { $type = "application/octet-stream" }
    $res.ContentType = $type

    if ($req.HttpMethod -eq "HEAD") {
      $fi = New-Object System.IO.FileInfo($path)
      $res.ContentLength64 = $fi.Length
      $res.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($path)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}
