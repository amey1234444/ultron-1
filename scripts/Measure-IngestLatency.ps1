<#
.SYNOPSIS
  Live latency for payloads travelling gateway -> EMQX -> application.

.DESCRIPTION
  Polls the application's /health endpoint and prints the latency the ingest
  pipeline is measuring for every payload it receives.

  Two numbers are reported, and they are not interchangeable:

    gateway->app  The gateway stamps created_at_us from ITS clock; the app
                  subtracts that from ITS clock. This is the figure people mean
                  by end-to-end latency, and it is only as good as the
                  gateway's clock. A Raspberry Pi has no battery-backed RTC, so
                  one that has not synced NTP reports its own clock error as
                  latency. The script warns when that is happening.

    pipeline      Arrival at the app -> frame on the wire to the browser.
                  Measured start to finish on one clock in one process, so it
                  is exact no matter what any gateway believes the time is.
                  This is the part the application is responsible for.

  What is NOT separable: the gateway->broker hop and the broker->app hop. MQTT
  carries no broker-side timestamp, so the two are only visible added together
  inside gateway->app.

.PARAMETER Url
  Base URL of the application. Defaults to the local dev server.

.PARAMETER IntervalSeconds
  Seconds between samples. Default 2.

.PARAMETER Samples
  How many times to poll. 0 (default) runs until Ctrl+C.

.PARAMETER Csv
  Optional path to append each sample to, for charting later.

.EXAMPLE
  .\Measure-IngestLatency.ps1 -Url https://ultron-sqnw.onrender.com

.EXAMPLE
  .\Measure-IngestLatency.ps1 -Url https://ultron-sqnw.onrender.com -Csv latency.csv
#>

[CmdletBinding()]
param(
    [string] $Url = 'http://localhost:3000',
    [int]    $IntervalSeconds = 2,
    [int]    $Samples = 0,
    [string] $Csv
)

$ErrorActionPreference = 'Stop'
$health = "$($Url.TrimEnd('/'))/health"

function Format-Ms {
    param($Value)
    if ($null -eq $Value) { return '     -' }
    return ('{0,6:N1}' -f [double]$Value)
}

Write-Host ""
Write-Host "Ingest latency - $health" -ForegroundColor Cyan
Write-Host ("-" * 96)

$taken = 0
$warnedSkew = $false
$warnedIdle = $false

while ($Samples -le 0 -or $taken -lt $Samples) {
    $taken++
    try {
        $response = Invoke-RestMethod -Uri $health -TimeoutSec 10 -Headers @{ 'Cache-Control' = 'no-cache' }
    }
    catch {
        Write-Host ("{0}  unreachable: {1}" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message) -ForegroundColor Red
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    $latency = $response.latency
    $broker = $response.broker
    $end = $latency.gatewayToApp
    $pipe = $latency.pipeline

    # Measurements first. Data can be arriving over the fallback gateway socket
    # with no broker configured at all, and the numbers are just as real; the
    # broker state is only worth reporting when nothing is coming through.
    if ($null -eq $end) {
        $reason = if (-not $broker.configured) {
            "no broker configured (INGEST_TRANSPORT=$($response.transport)) and nothing on the gateway socket"
        } elseif (-not $broker.connected) {
            "broker NOT connected - " + $(if ($broker.lastError) { $broker.lastError } else { 'check MQTT_HOST, credentials and the EMQX Authentication list' })
        } else {
            "broker connected, but no telemetry has arrived. Is the gateway running, and pointed at this same broker?"
        }
        if (-not $warnedIdle) {
            Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $reason) -ForegroundColor Yellow
            $warnedIdle = $true
        }
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }
    $warnedIdle = $false

    if ($broker.configured -and -not $broker.connected) {
        Write-Host ("{0}  warning: broker disconnected - figures below are the last {1} payloads received" -f `
            (Get-Date -Format 'HH:mm:ss'), $end.samples) -ForegroundColor Yellow
    }

    if ($taken -eq 1 -or ($taken % 20) -eq 1) {
        Write-Host ""
        Write-Host ("{0,-8} {1,-42} {2,-30} {3}" -f 'time', 'gateway->app (ms)', 'pipeline (ms)', 'msgs') -ForegroundColor DarkGray
        Write-Host ("{0,-8} {1,-42} {2,-30} {3}" -f '', 'p50    p95    p99    max    min', 'p50    p95    max', '') -ForegroundColor DarkGray
    }

    $line = "{0,-8} {1} {2} {3} {4} {5}  {6} {7} {8}  {9}" -f `
        (Get-Date -Format 'HH:mm:ss'), `
        (Format-Ms $end.p50), (Format-Ms $end.p95), (Format-Ms $end.p99), (Format-Ms $end.max), (Format-Ms $end.min), `
        (Format-Ms $pipe.p50), (Format-Ms $pipe.p95), (Format-Ms $pipe.max), `
        $end.total

    $colour = 'Green'
    if ($end.p95 -gt 1000) { $colour = 'Red' } elseif ($end.p95 -gt 500) { $colour = 'Yellow' }
    Write-Host $line -ForegroundColor $colour

    # Clock skew makes gateway->app meaningless, so say so loudly and once.
    if ($latency.anySkewSuspected -and -not $warnedSkew) {
        Write-Host ""
        Write-Host "  CLOCK SKEW SUSPECTED - gateway->app figures above are unreliable:" -ForegroundColor Magenta
        foreach ($name in $latency.clocks.PSObject.Properties.Name) {
            $clock = $latency.clocks.$name
            if ($clock.skewSuspected) {
                Write-Host ("    {0}: offset ~{1} ms" -f $name, $clock.estimatedOffsetMs) -ForegroundColor Magenta
                Write-Host ("    {0}" -f $clock.note) -ForegroundColor DarkGray
            }
        }
        Write-Host "  The pipeline column is measured on one clock and stays trustworthy." -ForegroundColor DarkGray
        Write-Host ""
        $warnedSkew = $true
    }

    if ($Csv) {
        [pscustomobject]@{
            timestamp      = (Get-Date -Format 'o')
            end_p50        = $end.p50
            end_p95        = $end.p95
            end_p99        = $end.p99
            end_max        = $end.max
            end_min        = $end.min
            pipeline_p50   = $pipe.p50
            pipeline_p95   = $pipe.p95
            pipeline_max   = $pipe.max
            messages_total = $end.total
            skew_suspected = $latency.anySkewSuspected
        } | Export-Csv -Path $Csv -NoTypeInformation -Append
    }

    Start-Sleep -Seconds $IntervalSeconds
}

Write-Host ""
Write-Host "Per-gateway breakdown:" -ForegroundColor Cyan
$final = Invoke-RestMethod -Uri $health -TimeoutSec 10
foreach ($name in $final.latency.perGateway.PSObject.Properties.Name) {
    $g = $final.latency.perGateway.$name
    Write-Host ("  {0,-20} p50 {1} ms   p95 {2} ms   max {3} ms   ({4} payloads)" -f `
        $name, (Format-Ms $g.p50), (Format-Ms $g.p95), (Format-Ms $g.max), $g.total)
}
if ($Csv) { Write-Host "`nAppended to $Csv" -ForegroundColor DarkGray }
