$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $taskRoot
$taskPython=Join-Path $taskRoot '.local/mapping-venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $taskPython)) {
    & py -3.12 -m venv .local/mapping-venv
    if ($LASTEXITCODE) {throw 'Python 3.12 is required.'}
}
& $taskPython -m pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE) {throw 'PyTorch installation failed.'}
$taskRepo=Join-Path $taskRoot '.local/lingbot-map'
if (!(Test-Path -LiteralPath $taskRepo)) {
    & git clone https://github.com/Robbyant/lingbot-map.git $taskRepo
    if ($LASTEXITCODE) {throw 'Source download failed.'}
}
if (& git -C $taskRepo status --porcelain --untracked-files=no) {throw 'The model checkout has tracked local changes; preserve those before preparing the trial.'}
& git -C $taskRepo checkout 8fdf984a7f9caf391622ea5843a8410900d27ef2
if ($LASTEXITCODE) {throw 'Pinned source revision is unavailable.'}
& $taskPython -m pip install numpy==2.2.6 opencv-python==4.11.0.86 -e $taskRepo
if ($LASTEXITCODE) {throw 'Model dependency installation failed.'}
& $taskPython experiments/lingbot-map/download_model.py .local/lingbot-map.pt
if ($LASTEXITCODE) {throw 'Checkpoint verification failed.'}
& $taskPython -c "import torch; assert torch.cuda.is_available(), 'CUDA is unavailable'; print('Ready:',torch.cuda.get_device_name(),torch.__version__)"
if ($LASTEXITCODE) {throw 'GPU readiness check failed.'}
Write-Host 'Ready. Run scripts/run-mapping.ps1 with -Video and your recording path. No model inference was started.'
