import json,pathlib
root=pathlib.Path('experiments/gaussian-splat')
def cell(code,kind='code'):
    item={'cell_type':kind,'metadata':{},'source':code.splitlines(keepends=True)}
    if kind=='code': item.update(execution_count=None,outputs=[])
    return item
setup='''import pathlib,subprocess,sys
root=pathlib.Path('/content/housekeeping-splat'); root.mkdir(exist_ok=True)
assert subprocess.run(['nvidia-smi'],capture_output=True).returncode == 0, 'Select a free T4 runtime first'
subprocess.run(['apt-get','update','-qq'],check=True)
subprocess.run(['apt-get','install','-y','-qq','colmap','ffmpeg'],check=True)
subprocess.run([sys.executable,'-m','pip','install','-q','uv'],check=True)
subprocess.run(['uv','venv','--python','3.10',str(root/'venv')],check=True)
python=str(root/'venv/bin/python')
subprocess.run(['uv','pip','install','--python',python,'torch==2.4.1','torchvision==0.19.1','--index-url','https://download.pytorch.org/whl/cu124'],check=True)
subprocess.run(['uv','pip','install','--python',python,'gsplat==1.4.0+pt24cu124','--no-deps','--find-links','https://docs.gsplat.studio/whl/pt24cu124/gsplat/'],check=True)
subprocess.run(['uv','pip','install','--python',python,'numpy==1.26.4','opencv-python-headless==4.10.0.84','pycolmap==3.12.6','nerfstudio==1.1.5','gsplat==1.4.0','torchmetrics==1.6.1','transformers==4.46.3'],check=True)
'''
sources="(root/'align_video.py').write_text("+repr((root/'align_video.py').read_text())+")\n(root/'train_component.py').write_text("+repr((root/'train_component.py').read_text())+")\n"
upload='''from google.colab import files
uploaded=files.upload()
assert len(uploaded)==1, 'Choose exactly one approved MP4 recording'
name,data=next(iter(uploaded.items()))
assert name.lower().endswith('.mp4') and len(data)<=250*1024*1024, 'Use an MP4 below 250 MB'
video=root/'recording.mp4'; video.write_bytes(data)
del uploaded,data
'''
align='''# Use a fresh output directory for each comparison.
MATCHING='exhaustive' # Slower than 'sequential', but tests all frame pairs.
subprocess.run([python,str(root/'align_video.py'),'--video',str(video),'--output',str(root/'alignment'),'--matching',MATCHING],check=True)
print((root/'alignment/report.json').read_text())
'''
train='''# Change to True only to intentionally test a labelled partial component.
ALLOW_PARTIAL=False
command=[python,str(root/'train_component.py'),'--alignment',str(root/'alignment'),'--output',str(root/'trial')]
if ALLOW_PARTIAL: command.append('--partial')
subprocess.run(command,check=True)
print((root/'trial/report.json').read_text())
'''
preview='''from IPython.display import display,Image
for path in sorted((root/'trial/renders/test/rgb').glob('*.png'))[:3]: display(Image(filename=str(path)))
files.download(str(root/'trial/report.json'))
for path in (root/'trial/export').glob('*.ply'): files.download(str(path))
'''
nb={'nbformat':4,'nbformat_minor':5,'metadata':{'colab':{'name':'COLMAP-Splatfacto trial','provenance':[]},'kernelspec':{'display_name':'Python 3','name':'python3'},'accelerator':'GPU'},'cells':[cell('# Private walkthrough rendering comparison\n\nSelect a **free T4 GPU**. Stop if payment is required. Free availability varies.\n\nUploads go to this temporary Google runtime. Keep the notebook private; never commit personal recordings, reconstruction outputs, or download credentials. The app and household schedule are not modified. Download results before deleting the runtime.\n\nCamera poses must be inspected before Gaussian rendering is trusted. A partial component cannot establish a complete home or measured floor plan.\n','markdown'),cell(setup+sources),cell(upload),cell(align),cell(train),cell(preview)]}
(root/'trial.ipynb').write_text(json.dumps(nb,indent=1)+'\n')
