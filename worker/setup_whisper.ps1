# Setup script for whisper.cpp on Windows
$ErrorActionPreference = "Stop"

# Define paths
$baseDir = Get-Location
$workerDir = Join-Path $baseDir "worker"
$binDir = Join-Path $workerDir "bin"
$modelsDir = Join-Path $workerDir "models"

# Create directories if they don't exist
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
}
if (-not (Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
}

$whisperUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.6.0/whisper-bin-x64.zip"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"

$zipPath = Join-Path $workerDir "whisper-bin-x64.zip"
$exePath = Join-Path $binDir "main.exe"
$modelPath = Join-Path $modelsDir "ggml-tiny.bin"

# Download whisper.cpp binary if it doesn't exist
if (-not (Test-Path $exePath)) {
    Write-Host "Downloading whisper.cpp precompiled binaries from $whisperUrl..."
    Invoke-WebRequest -Uri $whisperUrl -OutFile $zipPath -UserAgent "Mozilla/5.0"
    
    Write-Host "Extracting binaries..."
    # Extract only main.exe, sdl.dll, openblas.dll if present
    Expand-Archive -Path $zipPath -DestinationPath $binDir -Force
    
    # Clean up zip
    Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
} else {
    Write-Host "whisper.cpp binaries already exist at $exePath."
}

# Download GGML model if it doesn't exist
if (-not (Test-Path $modelPath)) {
    Write-Host "Downloading ggml-tiny.bin model from Hugging Face..."
    Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath -UserAgent "Mozilla/5.0"
} else {
    Write-Host "GGML model already exists at $modelPath."
}

# Verify execution
if (Test-Path $exePath) {
    Write-Host "Verifying whisper.cpp execution..."
    # Run the executable with --help to check if it runs correctly
    $testRun = Start-Process -FilePath $exePath -ArgumentList "--help" -NoNewWindow -PassThru -Wait
    if ($testRun.ExitCode -eq 0 -or $testRun.ExitCode -eq 1) {
        # Note: --help might exit with 0 or 1 depending on the version
        Write-Host "Verification Succeeded: whisper.cpp binary is functional."
    } else {
        throw "Verification Failed: Executable exited with code $($testRun.ExitCode)"
    }
} else {
    throw "Verification Failed: main.exe not found at $exePath"
}
