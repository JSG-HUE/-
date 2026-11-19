param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'

function Send-Response($client, [string]$status, [string]$contentType, [byte[]]$body) {
  $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream = $client.GetStream()
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Get-ContentType([string]$file) {
  switch ([System.IO.Path]::GetExtension($file).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.htm'  { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.txt'  { 'text/plain; charset=utf-8' }
    '.svg'  { 'image/svg+xml' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.webp' { 'image/webp' }
    default { 'application/octet-stream' }
  }
}

$listener = $null
$selected = $Port
for ($p = $Port; $p -lt ($Port + 30); $p++) {
  $candidate = $null
  try {
    $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $candidate.Start()
    $listener = $candidate
    $selected = $p
    break
  } catch {
    if ($candidate) { try { $candidate.Stop() } catch { } }
  }
}

if (-not $listener) {
  Write-Host 'No free local port found.'
  exit 1
}

$url = "http://127.0.0.1:$selected/index.html"
Write-Host ''
Write-Host '  China 1927-1949  /  Camera Server'
Write-Host "  $url"
Write-Host '  Camera works on this localhost address.'
Write-Host '  Close this window to stop the server.'
Write-Host ''

if (-not $NoBrowser) {
  try { Start-Process $url } catch { Write-Host 'Open the URL above manually.' }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 5000
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      $parts = $requestLine.Split(' ')
      $method = $parts[0]
      $rawPath = $parts[1]

      while (($header = $reader.ReadLine()) -ne $null -and $header -ne '') { }

      if ($method -ne 'GET') {
        Send-Response $client '405 Method Not Allowed' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed'))
        continue
      }

      $path = ($rawPath -split '\?')[0]
      try { $path = [System.Uri]::UnescapeDataString($path) } catch { $path = '/' }
      if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }

      $relative = $path.TrimStart('/').Replace('/', '\')
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Response $client '403 Forbidden' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('Forbidden'))
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Response $client '404 Not Found' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('Not Found'))
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($full)
      $type = Get-ContentType $full
      Send-Response $client '200 OK' $type $body
    } catch {
      # Ignore a broken browser connection and keep serving.
    } finally {
      if ($client) { try { $client.Close() } catch { } }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
  Write-Host 'Server stopped.'
}
