# COLMAP / Splatfacto comparison trial

This experiment tests whether a walkthrough provides camera poses suitable for
a more detailed Gaussian reconstruction. It does not recognize cleaning duties
or update the household. Keep recordings, models, notebooks with personal
outputs and credential-bearing cells outside the public repository.

## Camera alignment

Create an isolated Python 3.11 or 3.12 environment. Install
`numpy==1.26.4 opencv-python-headless==4.10.0.84 pycolmap==3.12.6`.
Run from the repository root:

```text
python experiments/gaussian-splat/align_video.py --video YOUR_VIDEO.mp4 --output .local/colmap-trial
```

The default processes the first 30 seconds at 4 fps, preserves image aspect
ratio at 1280-pixel width, and uses CPU SIFT feature extraction and sequential
matching. It works without a GPU. Each trial requires a fresh output folder.
`--matching exhaustive` matches all frame pairs for a broader comparison.
`--seconds 60` or `--seconds 90` and `--fps 2` are optional bounded alternatives.

`report.json` records the connected components, registered frame counts and
mean reprojection errors. `trainingEligible` requires at least 80% of sampled
frames in the largest component, at least 60 registered frames, and mean error
at most two pixels. These are experiment gates, not guarantees of geometric
accuracy. Inspect the trajectory and held-out renders as well. Separate pieces
must not be presented as one continuous home model.

## GPU rendering stage

Open [the private trial in Colab](https://colab.research.google.com/github/iamnajib71/housekeeping/blob/main/experiments/gaussian-splat/trial.ipynb).
The source notebook has no personal inputs or outputs. Upload your own approved
recording into your private runtime. Its setup uses isolated Python 3.10,
PyTorch 2.4.1 with CUDA 12.4, Nerfstudio 1.1.5 and the official precompiled
gsplat 1.4.0 package for that PyTorch/CUDA combination. This avoids compiling
the renderer on Colab's CPU. The notebook defaults to exhaustive matching.

Use a temporary Linux runtime with a free T4 GPU for Nerfstudio/Splatfacto.
Gaussian training follows camera alignment; installing a renderer cannot
repair disconnected poses. The current app imports its bounded point-cloud
JSON format, not Gaussian PLY files. Gaussian results require a separate
viewer and remain a comparison experiment until visually validated.

`train_component.py --alignment ALIGNMENT --output FRESH_OUTPUT` prepares the
largest component, trains for 3,000 iterations, renders held-out frames and
exports a Gaussian PLY. `--partial` explicitly permits a labelled component
experiment after the full-clip alignment gate fails. It still requires at
least 20 registered views, 1,000 points and mean error at most two pixels.
Small partial trials cannot establish whole-home quality. Regenerate the
standalone notebook after script changes with
`python scripts/make-splat-notebook.py`.

Primary references:

- [PyCOLMAP 3.12.6](https://pypi.org/project/pycolmap/3.12.6/)
- [Nerfstudio custom data](https://docs.nerf.studio/quickstart/custom_dataset.html)
- [Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)
- [Official precompiled renderer wheels](https://docs.gsplat.studio/whl/pt24cu124/gsplat/)

## Trial observations — 11 October 2026

The approved replacement recording was sampled at four frames per second over
its first 30 seconds. CPU COLMAP 3.12.6 on Windows produced these results:

| Matching | Largest component | Sparse points | Mean reprojection error | Full-clip gate |
| --- | ---: | ---: | ---: | --- |
| Sequential, overlap 20 | 44 / 120 views | 3,086 | 0.995 pixels | Failed |
| Exhaustive | 73 / 120 views | 8,138 | 1.154 pixels | Failed |

Exhaustive matching took 609.78 seconds including decoding, feature extraction,
matching and reconstruction. The first sequential run crossed a computer
suspension, so its elapsed time is not a useful performance comparison.

A separate Linux Colab exhaustive pass completed with five components. Its
largest had 49 / 120 views, 2,556 sparse points and mean reprojection error
1.037 pixels. It also failed the full-clip gate and emitted bundle-adjustment
numerical solver warnings. Its wall time includes a deliberate pause while
the original renderer source build used the CPU, so it is not a clean speed
comparison. The final GPU rendering trial used the verified Windows component
described below rather than claiming an end-to-end cloud home reconstruction.

The 44-view component was transferred privately to a free Colab Tesla T4 and
used to train Splatfacto for 3,000 iterations. Sampled frame dimensions and
perceptual hashes matched across the Windows and cloud decoders. The cloud
renderer used Python 3.10, PyTorch 2.4.1+cu124, Nerfstudio 1.1.5 and the
official gsplat 1.4.0+pt24cu124 wheel. Preparing the dataset, training, rendering
held-out views and exporting took 259.38 seconds, excluding environment setup
and camera alignment. The export contains 176,657 Gaussians in a 43,812,529-byte
PLY. A separate 5,653,024-byte legacy Splat preview retains geometry and basic
colour but discards higher spherical-harmonic colour coefficients.

Held-out renders show recognizable door frames, wooden wall panels and carpet,
with some blurred/warped edges. This is a clearer visual representation of one
connected area than the earlier sparse point-cloud display. It is still a
partial reconstruction. Rendering quality does not establish physical scale,
complete coverage, correct room boundaries, or cleaning detection. Personal
previews and geometry remain under ignored `.local`; no household duties or
production configuration were changed.

A four-second, 36-frame interpolation preview was also rendered from the
held-out camera poses. Moving between poses is a useful check for holes and
warping; matching a recorded view alone cannot establish reliable geometry.
