<#
.SYNOPSIS
  Subscribe to the Ultron MQTT tree and show each payload with the latency it
  took to reach this machine.

.DESCRIPTION
  Speaks MQTT 3.1.1 directly over TLS using only .NET types, so nothing has to
  be installed - no mosquitto, no NuGet package. It connects to the broker as
  an ordinary subscriber, exactly like the application does, and for every
  message it prints:

      how old the payload is    now (this machine's clock)
                                minus created_at_us (the gateway's clock)
      the topic it arrived on
      a summary of the payload, or the whole thing with -ShowPayload

  READ THE CLOCK WARNING. The latency is a subtraction across two machines'
  clocks, so it includes any difference between them. A Raspberry Pi has no
  battery-backed RTC; one that has not synced NTP will report its clock error
  as latency, and the number will be wrong by exactly that much in every
  sample. The summary at the end flags this: the smallest latency seen is a
  good estimate of the offset, because real latency has a small positive floor
  and cannot be negative. A negative figure is proof of skew.

  Ctrl+C to stop; a distribution summary is printed on the way out.

.PARAMETER BrokerHost
  EMQX hostname, e.g. w7511c90.ala.asia-southeast1.emqxsl.com

.PARAMETER Port
  Broker port. 8883 for TLS (default), 1883 for a plain local broker.

.PARAMETER Username
  Broker username. Use a subscribe-capable account.

.PARAMETER Password
  Broker password.

.PARAMETER Topic
  Topic filter to subscribe to. Defaults to the whole gateway tree.

.PARAMETER NoTls
  Connect in plain text. Only for a local broker; EMQX Cloud requires TLS.

.PARAMETER ShowPayload
  Print the full JSON payload of every message instead of a one-line summary.

.PARAMETER Seconds
  Stop automatically after this many seconds. 0 (default) runs until Ctrl+C.

.EXAMPLE
  .\Watch-MqttLatency.ps1 -BrokerHost w7511c90.ala.asia-southeast1.emqxsl.com `
      -Username ultron-app -Password 'secret'

.EXAMPLE
  .\Watch-MqttLatency.ps1 -BrokerHost localhost -Port 1883 -NoTls `
      -Topic 'ultron/v1/gateways/+/racks/+/telemetry' -ShowPayload
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $BrokerHost,
    [int]    $Port = 8883,
    [Parameter(Mandatory = $true)] [string] $Username,
    [Parameter(Mandatory = $true)] [string] $Password,
    [string] $Topic = 'ultron/v1/gateways/#',
    [switch] $NoTls,
    [switch] $ShowPayload,
    [int]    $Seconds = 0
)

$ErrorActionPreference = 'Stop'

# --- MQTT 3.1.1 wire format ------------------------------------------------
# Only what a subscriber needs: CONNECT, SUBSCRIBE, PINGREQ out; CONNACK,
# SUBACK, PUBLISH, PINGRESP in. Subscribing at QoS 0 means the broker downgrades
# QoS 1 traffic on delivery, so there is no PUBACK to send and no packet ids to
# track - the whole acknowledgement path disappears.

function Write-RemainingLength {
    param([System.Collections.Generic.List[byte]] $Buffer, [int] $Length)
    do {
        $byte = $Length % 128
        $Length = [math]::Floor($Length / 128)
        if ($Length -gt 0) { $byte = $byte -bor 128 }
        $Buffer.Add([byte]$byte)
    } while ($Length -gt 0)
}

function Add-MqttString {
    param([System.Collections.Generic.List[byte]] $Buffer, [string] $Value)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $Buffer.Add([byte](($bytes.Length -shr 8) -band 0xFF))
    $Buffer.Add([byte]($bytes.Length -band 0xFF))
    $Buffer.AddRange($bytes)
}

function New-ConnectPacket {
    param([string] $ClientId, [string] $User, [string] $Pass, [int] $KeepAlive = 60)
    $body = New-Object 'System.Collections.Generic.List[byte]'
    Add-MqttString $body 'MQTT'
    $body.Add([byte]4)                              # protocol level 3.1.1
    $body.Add([byte](0x80 -bor 0x40 -bor 0x02))     # username + password + clean session
    $body.Add([byte](($KeepAlive -shr 8) -band 0xFF))
    $body.Add([byte]($KeepAlive -band 0xFF))
    Add-MqttString $body $ClientId
    Add-MqttString $body $User
    Add-MqttString $body $Pass

    $packet = New-Object 'System.Collections.Generic.List[byte]'
    $packet.Add([byte]0x10)
    Write-RemainingLength $packet $body.Count
    $packet.AddRange($body)
    return $packet.ToArray()
}

function New-SubscribePacket {
    param([string] $Filter, [int] $PacketId = 1)
    $body = New-Object 'System.Collections.Generic.List[byte]'
    $body.Add([byte](($PacketId -shr 8) -band 0xFF))
    $body.Add([byte]($PacketId -band 0xFF))
    Add-MqttString $body $Filter
    $body.Add([byte]0)                              # QoS 0

    $packet = New-Object 'System.Collections.Generic.List[byte]'
    $packet.Add([byte]0x82)                         # SUBSCRIBE requires flags 0010
    Write-RemainingLength $packet $body.Count
    $packet.AddRange($body)
    return $packet.ToArray()
}

function Read-Exact {
    param($Stream, [int] $Count)
    if ($Count -eq 0) { return , @() }
    $buffer = New-Object byte[] $Count
    $read = 0
    while ($read -lt $Count) {
        $got = $Stream.Read($buffer, $read, $Count - $read)
        if ($got -le 0) { throw 'broker closed the connection' }
        $read += $got
    }
    return , $buffer
}

function Read-RemainingLength {
    param($Stream)
    $multiplier = 1
    $value = 0
    do {
        $byte = (Read-Exact $Stream 1)[0]
        $value += ($byte -band 127) * $multiplier
        $multiplier *= 128
        if ($multiplier -gt 128 * 128 * 128) { throw 'malformed remaining length' }
    } while (($byte -band 128) -ne 0)
    return $value
}

$connackReasons = @{
    0 = 'accepted'
    1 = 'unacceptable protocol version'
    2 = 'client id rejected'
    3 = 'server unavailable'
    4 = 'bad username or password'
    5 = 'not authorized - check the user exists in EMQX Authentication'
}

# --- Connect ---------------------------------------------------------------
$clientId = "ultron-latency-$([guid]::NewGuid().ToString('N').Substring(0,8))"
Write-Host ""
Write-Host "Connecting to $BrokerHost`:$Port as $Username ($clientId)" -ForegroundColor Cyan

$tcp = New-Object System.Net.Sockets.TcpClient
$tcp.Connect($BrokerHost, $Port)
$stream = $tcp.GetStream()

if (-not $NoTls) {
    $ssl = New-Object System.Net.Security.SslStream($stream, $false)
    $ssl.AuthenticateAsClient($BrokerHost)
    $stream = $ssl
}
$stream.ReadTimeout = 5000

$connect = New-ConnectPacket -ClientId $clientId -User $Username -Pass $Password
$stream.Write($connect, 0, $connect.Length)
$stream.Flush()

$type = (Read-Exact $stream 1)[0]
$null = Read-RemainingLength $stream
$connack = Read-Exact $stream 2
if (($type -shr 4) -ne 2) { throw "expected CONNACK, got packet type $($type -shr 4)" }
$code = $connack[1]
if ($code -ne 0) {
    $reason = if ($connackReasons.ContainsKey([int]$code)) { $connackReasons[[int]$code] } else { "code $code" }
    throw "broker refused the connection: $reason"
}
Write-Host "Connected. Subscribing to $Topic" -ForegroundColor Cyan

$subscribe = New-SubscribePacket -Filter $Topic
$stream.Write($subscribe, 0, $subscribe.Length)
$stream.Flush()

$type = (Read-Exact $stream 1)[0]
$len = Read-RemainingLength $stream
$suback = Read-Exact $stream $len
if (($type -shr 4) -ne 9) { throw "expected SUBACK, got packet type $($type -shr 4)" }
if ($suback[2] -eq 0x80) { throw "subscription to '$Topic' was REFUSED - the ACL does not allow this user to subscribe there" }

Write-Host "Subscribed. Waiting for payloads - Ctrl+C to stop." -ForegroundColor Cyan
Write-Host ""
Write-Host ("{0,-12} {1,10}  {2}" -f 'time', 'latency', 'topic / payload') -ForegroundColor DarkGray
Write-Host ("-" * 100) -ForegroundColor DarkGray

# --- Receive ---------------------------------------------------------------
$latencies = New-Object 'System.Collections.Generic.List[double]'
$perTopic = @{}
$started = Get-Date
$lastPing = Get-Date
$count = 0

try {
    while ($true) {
        if ($Seconds -gt 0 -and ((Get-Date) - $started).TotalSeconds -ge $Seconds) { break }

        # Keepalive. The broker drops a client that goes quiet for 1.5x the
        # keepalive it announced at CONNECT.
        if (((Get-Date) - $lastPing).TotalSeconds -ge 25) {
            $stream.Write([byte[]](0xC0, 0x00), 0, 2)
            $stream.Flush()
            $lastPing = Get-Date
        }

        try { $type = (Read-Exact $stream 1)[0] }
        catch { if ($_.Exception -is [System.IO.IOException]) { continue } else { throw } }

        $len = Read-RemainingLength $stream
        $body = Read-Exact $stream $len
        $arrived = Get-Date

        if (($type -shr 4) -ne 3) { continue }   # not a PUBLISH (PINGRESP etc.)

        $topicLength = ($body[0] -shl 8) -bor $body[1]
        $msgTopic = [System.Text.Encoding]::UTF8.GetString($body, 2, $topicLength)
        $offset = 2 + $topicLength
        # QoS is bits 1-2 of the flags; we subscribed at QoS 0, but be safe.
        $qos = ($type -band 0x06) -shr 1
        if ($qos -gt 0) { $offset += 2 }
        $json = [System.Text.Encoding]::UTF8.GetString($body, $offset, $body.Length - $offset)

        $count++
        $latencyMs = $null
        $summary = ''
        try {
            $payload = $json | ConvertFrom-Json
            if ($payload.created_at_us) {
                # created_at_us is microseconds since the epoch, as a string so
                # no JSON parser rounds it.
                $sentMs = [double]$payload.created_at_us / 1000.0
                $nowMs = [double]([DateTimeOffset]$arrived).ToUnixTimeMilliseconds()
                $latencyMs = $nowMs - $sentMs
                $latencies.Add($latencyMs)
                if (-not $perTopic.ContainsKey($msgTopic)) { $perTopic[$msgTopic] = New-Object 'System.Collections.Generic.List[double]' }
                $perTopic[$msgTopic].Add($latencyMs)
            }
            if ($payload.payload.slots) {
                $slots = @($payload.payload.slots)
                $first = $slots[0]
                $summary = "{0} slots, e.g. slot {1} = {2}" -f $slots.Count, $first.slot_number,
                    $(if ($first.value_with_unit) { $first.value_with_unit } else { $first.value_formatted })
            }
            elseif ($payload.payload.state) { $summary = "state=$($payload.payload.state)" }
            elseif ($payload.schema) { $summary = $payload.schema }
        }
        catch { $summary = '(unparseable JSON)' }

        $shown = if ($null -eq $latencyMs) { '       n/a' } else { ('{0,8:N1}ms' -f $latencyMs) }
        $colour = if ($null -eq $latencyMs) { 'DarkGray' }
                  elseif ($latencyMs -lt 0 -or $latencyMs -gt 5000) { 'Magenta' }
                  elseif ($latencyMs -gt 1000) { 'Red' }
                  elseif ($latencyMs -gt 300) { 'Yellow' }
                  else { 'Green' }

        Write-Host ("{0,-12} {1}  {2}" -f $arrived.ToString('HH:mm:ss.fff'), $shown, $msgTopic) -ForegroundColor $colour
        if ($summary) { Write-Host ("{0,-12} {1,10}  -> {2}" -f '', '', $summary) -ForegroundColor DarkGray }
        if ($ShowPayload) { Write-Host $json -ForegroundColor DarkGray }
    }
}
finally {
    Write-Host ""
    Write-Host ("-" * 100) -ForegroundColor DarkGray
    Write-Host "$count payload(s) received over $([math]::Round(((Get-Date) - $started).TotalSeconds, 1))s" -ForegroundColor Cyan

    if ($latencies.Count -gt 0) {
        $sorted = $latencies | Sort-Object
        $at = { param($p) $sorted[[math]::Min($sorted.Count - 1, [math]::Floor(($sorted.Count - 1) * $p))] }
        $min = $sorted[0]
        Write-Host ("  latency  min {0:N1}  p50 {1:N1}  p95 {2:N1}  p99 {3:N1}  max {4:N1}  (ms)" -f `
            $min, (& $at 0.5), (& $at 0.95), (& $at 0.99), $sorted[$sorted.Count - 1]) -ForegroundColor Cyan

        Write-Host ""
        if ($min -lt 0) {
            Write-Host "  CLOCK SKEW: payloads arrived stamped in the future, so the gateway clock is" -ForegroundColor Magenta
            Write-Host ("  AHEAD of this machine by at least {0:N0} ms. These latencies are not real." -f [math]::Abs($min)) -ForegroundColor Magenta
            Write-Host "  Fix: sudo timedatectl set-ntp true   (on the gateway)" -ForegroundColor DarkGray
        }
        elseif ($min -gt 2000) {
            Write-Host ("  CLOCK SKEW LIKELY: even the fastest payload took {0:N0} ms, far above any" -f $min) -ForegroundColor Magenta
            Write-Host "  network floor. The gateway clock is probably BEHIND this machine by about" -ForegroundColor Magenta
            Write-Host "  that much. Subtract it from every figure, or sync NTP on the gateway." -ForegroundColor Magenta
            Write-Host "  Fix: sudo timedatectl set-ntp true   (on the gateway)" -ForegroundColor DarkGray
        }
        else {
            Write-Host ("  Clocks look sane: the fastest payload took {0:N0} ms, which is plausible as a" -f $min) -ForegroundColor DarkGray
            Write-Host "  real network floor, so the figures above can be read as actual latency." -ForegroundColor DarkGray
        }

        if ($perTopic.Count -gt 1) {
            Write-Host ""
            Write-Host "  by topic:" -ForegroundColor Cyan
            foreach ($key in ($perTopic.Keys | Sort-Object)) {
                $values = $perTopic[$key] | Sort-Object
                $median = $values[[math]::Floor(($values.Count - 1) / 2)]
                Write-Host ("    {0,-9:N1} ms median  x{1,-5} {2}" -f $median, $values.Count, $key) -ForegroundColor DarkGray
            }
        }
    }
    elseif ($count -gt 0) {
        Write-Host "  No payload carried created_at_us, so no latency could be computed." -ForegroundColor Yellow
    }
    Write-Host ""
    if ($tcp) { $tcp.Close() }
}
