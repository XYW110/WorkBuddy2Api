#Requires -Version 5.1
<#
.SYNOPSIS
  从 Windows 本机 CodeBuddy 桌面端导出凭证 JSON（D5 契约），供管理端 upload 使用。

.DESCRIPTION
  读取 %LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info，
  映射为可被 POST /admin/credentials/upload 消费的 local-file JSON。
  不启动后端、不发起网络请求。输出含明文 token，请勿提交到 git。

.PARAMETER OutFile
  可选。写入 UTF-8（无 BOM）文件；指定后 stdout 不再输出 JSON。

.PARAMETER Name
  导出 JSON 的 name 字段，默认「本地账号」。

.PARAMETER Source
  导出 JSON 的 source 字段，默认 export。

.PARAMETER InfoPath
  覆盖默认 info 路径（干跑/mock 用）。

.PARAMETER Compact
  压缩 JSON（无缩进）。默认缩进 2 空格。

.EXAMPLE
  .\export-credential.ps1

.EXAMPLE
  .\export-credential.ps1 -OutFile .\cred.json -Name "我的账号"

.EXAMPLE
  .\export-credential.ps1 -InfoPath .\mock-info.json
#>
[CmdletBinding()]
param(
  [string]$OutFile,
  [string]$Name = "本地账号",
  [string]$Source = "export",
  [string]$InfoPath,
  [switch]$Compact
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
function Write-Err([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

# Safe property access: returns $null when object is null or property missing (StrictMode-safe)
function Get-Field([object]$Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

function Get-DefaultInfoPath {
  $localAppData = $env:LOCALAPPDATA
  if ([string]::IsNullOrWhiteSpace($localAppData)) {
    Write-Err "LOCALAPPDATA 未设置，无法定位桌面凭证。请用 -InfoPath 指定文件。"
    exit 2
  }
  return Join-Path $localAppData "CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info"
}

function ConvertTo-Utf8NoBomString([object]$Object, [bool]$UseCompact) {
  if ($UseCompact) {
    return ($Object | ConvertTo-Json -Compress -Depth 8)
  }
  return ($Object | ConvertTo-Json -Depth 8)
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
    Write-Err "输出目录不存在: $dir"
    exit 6
  }
  $encoding = New-Object System.Text.UTF8Encoding $false
  try {
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
  } catch {
    Write-Err "写入失败: $Path"
    Write-Err $_.Exception.Message
    exit 6
  }
}

# --- resolve path ---
$path = if (-not [string]::IsNullOrWhiteSpace($InfoPath)) { $InfoPath } else { Get-DefaultInfoPath }

if (-not (Test-Path -LiteralPath $path)) {
  Write-Err "凭证文件不存在: $path"
  exit 2
}

# --- read + parse ---
try {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
} catch {
  Write-Err "读取失败: $path"
  Write-Err $_.Exception.Message
  exit 3
}

try {
  $info = $raw | ConvertFrom-Json
} catch {
  Write-Err "JSON 非法，无法解析: $path"
  Write-Err $_.Exception.Message
  exit 4
}

# --- map fields (align upload createCredentialFromPayload) ---
$auth = Get-Field -Object $info -Name "auth"
$account = Get-Field -Object $info -Name "account"
$accessToken = Get-Field -Object $auth -Name "accessToken"
$refreshToken = Get-Field -Object $auth -Name "refreshToken"
$uid = Get-Field -Object $account -Name "uid"

$missing = @()
if ([string]::IsNullOrWhiteSpace([string]$accessToken)) { $missing += "auth.accessToken" }
if ([string]::IsNullOrWhiteSpace([string]$refreshToken)) { $missing += "auth.refreshToken" }
if ([string]::IsNullOrWhiteSpace([string]$uid)) { $missing += "account.uid" }
if ([string]::IsNullOrWhiteSpace($Name)) { $missing += "name (-Name)" }

if ($missing.Count -gt 0) {
  Write-Err ("缺少必填字段（对齐 upload local-file）: " + ($missing -join ", "))
  exit 5
}

$payload = [ordered]@{
  name         = $Name
  type         = "local-file"
  accessToken  = [string]$accessToken
  refreshToken = [string]$refreshToken
  uid          = [string]$uid
  source       = $Source
}

$json = ConvertTo-Utf8NoBomString -Object $payload -UseCompact:$Compact.IsPresent

if (-not [string]::IsNullOrWhiteSpace($OutFile)) {
  Write-Utf8NoBomFile -Path $OutFile -Content $json
  Write-Err "已写入: $OutFile"
  exit 0
}

# stdout only JSON (no extra noise)
[Console]::Out.WriteLine($json)
exit 0
