# Experimental 3D home mapping

The existing Gemini walkthrough suggests rooms and cleaning duties. This separate LingBot-Map trial reconstructs relative geometry and camera motion. It does not recognize room names, detect dirt, prove cleaning, or produce measured floor plans. Admin labels remain necessary.

## Cloud trial

Open [the notebook in Colab](https://colab.research.google.com/github/iamnajib71/housekeeping/blob/main/experiments/lingbot-map/trial.ipynb). Select a free T4 GPU runtime. Free GPU availability and session limits vary; stop if an upgrade is required. Reconstruction runs in Colab, outside Vercel and Supabase. There is no always-on free GPU service.

Upload one recording below 250 MB and up to three minutes. The default trial samples the first 30 seconds at 2 fps and uses 336-pixel images. Use a slow continuous walkthrough. For memory errors, reconnect and use 252-pixel images and 1 fps. Longer experiments need their own resource assessment.

The notebook pins upstream code to `8fdf984a7f9caf391622ea5843a8410900d27ef2` and the checkpoint to Hugging Face revision `204754b`. PyTorch 2.8, NumPy 2.2.6 and OpenCV 4.11 are installed in the temporary runtime. Model loading uses `weights_only=True` and requires matching state keys. GPU inference timing excludes installation and model loading; the report includes actual GPU, frame count, allocated peak GPU memory, export size and revisions. These reduced settings are not paper benchmark results.

Download the map JSON and benchmark report. In the app, sign in as admin and open setup → Experimental 3D home mapping → Import map result. Rotate the reconstruction, inspect camera positions by video time, and add area labels and visible fixtures. Create a cleaning draft and review it through the existing replacement workflow. No schedule changes happen until the final confirmation. Daily duties use the existing light routine; Monday work uses the existing division and rotation; Tuesday bin duties are retained. Started/submitted work keeps its original checklist and history.

## Privacy and boundaries

- Uploading sends the selected video to Google Colab. No database credentials, Gmail tokens or Gemini keys are needed.
- Use a private notebook. Never save personal recordings, point clouds or credential-bearing cells/outputs to public GitHub.
- Map geometry stays in the browser tab. Creating a draft sends only bounded area names, fixtures, time ranges and clip duration to the existing admin-only endpoint.
- Imported geometry is limited to 4 MB, 30,000 points, 120 cameras and 60 seconds. Nonfinite coordinates, invalid colours and malformed timestamps are rejected. Rendering uses canvas, not imported executable content.
- Download results before closing the tab. Use Runtime → Disconnect and delete runtime after the trial. Temporary GPU files are not household proof photos and do not use the app's 15-day photo retention rule.

## Validation

`npm test` covers map validation and task draft conversion. `scripts/mapping-check.mts` checks mobile import, invalid-file errors, labels-only draft submission, explicit review and anonymous API denial. `test_export_map.py` checks compact geometry exports on CPU without loading the model. Synthetic fixtures validate the interface only; a real cloud GPU result is required before making reconstruction performance claims.

## Measured cloud trial (10 October 2026)

The original approved onboarding recording completed on a free Colab Tesla T4. The first 30 seconds produced 60 sampled frames at 336-pixel input, 20,000 exported points and a 793,903-byte map. GPU inference took 13.682 seconds, with 3,774.6 MB of peak allocated GPU memory. Installation, checkpoint loading, frame extraction and CPU export are excluded from that timing. The exporter unprojects the checkpoint's depth predictions using its estimated camera poses and intrinsics, matching the upstream viewer's reconstruction path.

The actual geometry passed import validation and mobile rendering in the deployed app. Draft writes were mocked during that UI check, so the household schedule was not replaced. This confirms the trial runs and exports; it does not establish room-recognition accuracy, reconstruction completeness, measured scale, or cleaning detection. Personal geometry and the source video remain outside the public repository.

## Local comparison

On Windows with Python 3.12, Git and an NVIDIA CUDA GPU, run `powershell -NoProfile -File scripts/setup-mapping.ps1` from the checkout. It uses an isolated `.local/mapping-venv`, pins the upstream checkout, resumes the checkpoint download and verifies its published SHA-256. It checks GPU availability without running inference. No global Python environment is changed.

After the cloud trial, run `powershell -NoProfile -File scripts/run-mapping.ps1 -Video "path/to/recording.mp4"`. Defaults are 252-pixel input and 1 fps for the local 8 GB RTX 3070. The first 30 seconds are processed. Results and a benchmark report are written under `.local`, which Git ignores. Import the map into the live app to compare it with the cloud result. Optional parameters are `-ClipSeconds`, `-ImageSize` and `-Fps`. Close other GPU-heavy apps before running. No local web server or database key is required for inference.

## Sources

- [LingBot-Map source and Apache 2.0 license](https://github.com/Robbyant/lingbot-map)
- [Model checkpoint](https://huggingface.co/robbyant/lingbot-map)
- [Official Google Colab MCP bridge](https://github.com/googlecolab/colab-mcp)
- [Colab free-tier FAQ](https://research.google.com/colaboratory/faq.html)
