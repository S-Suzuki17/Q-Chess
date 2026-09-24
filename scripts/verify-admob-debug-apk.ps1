param(
    [string]$Apk = 'android/app/build/outputs/apk/debug/app-debug.apk',
    [string]$WebOutput = 'out',
    [ValidateSet('com.qgambit.app', 'com.qgambit.app.qa')]
    [string]$ExpectedPackage = 'com.qgambit.app',
    [string]$BuildTools = "$env:LOCALAPPDATA/Android/Sdk/build-tools/36.0.0"
)
$ErrorActionPreference = 'Stop'
$apkPath = (Resolve-Path -LiteralPath $Apk).Path
$webPath = (Resolve-Path -LiteralPath $WebOutput).Path
$signature = & (Join-Path $BuildTools 'apksigner.bat') verify $apkPath 2>&1
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed: $signature" }
$badging = & (Join-Path $BuildTools 'aapt.exe') dump badging $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK metadata' }
$metadata = $badging -join "`n"
if ($metadata -notmatch ("package: name='" + [regex]::Escape($ExpectedPackage) + "'")) { throw 'Wrong application package' }
if ($metadata -notmatch 'application-debuggable') { throw 'Expected a debug test artifact, not a store release' }
if ($metadata -match "uses-permission: name='(?:com.google.android.gms.permission.AD_ID|android.permission.ACCESS_ADSERVICES_[^']+)'") {
    throw 'Advertising identifier/Privacy Sandbox permission unexpectedly merged into APK'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apkPath)
$verified = 0
try {
    foreach ($file in Get-ChildItem -LiteralPath $webPath -File -Recurse) {
        $relative = [IO.Path]::GetRelativePath($webPath, $file.FullName).Replace('\', '/')
        $entry = $archive.GetEntry("assets/public/$relative")
        if ($null -eq $entry) { throw "Missing bundled Web file: $relative" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [Convert]::ToHexString($sha.ComputeHash($stream)) }
        finally { $stream.Dispose(); $sha.Dispose() }
        $expected = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($actual -ne $expected) { throw "Stale bundled Web file: $relative" }
        $verified++
    }
    if ($verified -eq 0) { throw 'No Web output to verify' }
} finally { $archive.Dispose() }
[pscustomobject]@{
    Status = 'PASS (artifact checks only; not device or ad-serving QA)'
    Package = ($badging | Select-String '^package:').Line
    WebFilesVerified = $verified
    Sha256 = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash
    Artifact = $apkPath
}
