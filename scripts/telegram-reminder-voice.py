"""Generate a short trial reminder; never places a call or reads credentials."""
import argparse
import asyncio
import json
import hashlib
import subprocess
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
STYLES = {
    'hero': ('en-US-GuyNeural', '-5%', '-8Hz', 'Your mission, should you choose to accept it: a cleaner home. Check your tasks and add your proof before ten P M. Small effort, heroic results.'),
    'comic': ('en-GB-RyanNeural', '+4%', '+2Hz', 'The kitchen has requested a meeting. Apparently, the crumbs have formed a committee. Check your cleaning tasks and add your proof before ten P M. Thank you, champion.'),
    'coach': ('en-AU-WilliamNeural', '+2%', '+0Hz', 'You have got this. A quick reset makes a big difference for everyone. Check your cleaning tasks and add your photo proof before ten P M. Teamwork keeps the place feeling good.'),
    'gentle': ('en-AU-NatashaNeural', '-3%', '+0Hz', 'Here is a friendly nudge for our shared home. When your cleaning is finished, add your photo proof in the app before ten P M. Thanks for doing your part.'),
    'announcer': ('en-US-JennyNeural', '+1%', '+2Hz', 'Housekeeping update: today is a great day to defeat dust. Your checklist is waiting in the app. Please add your cleaning proof before ten P M. That concludes this tiny announcement.'),
    'hindi-comic': ('hi-IN-MadhurNeural', '+2%', '+0Hz', 'यह हाउसकीपिंग की टेस्ट कॉल है। रसोई के टुकड़ों ने अपनी यूनियन बना ली है! अपने सफाई के काम ऐप में देख लें, और रात दस बजे से पहले फोटो का सबूत भेज दें। बस एक छोटा सा रिमाइंडर। शुक्रिया, हीरो!'),
}
KOKORO_VOICES = {'hero': 'am_adam', 'comic': 'bm_george', 'coach': 'am_michael', 'gentle': 'af_heart', 'announcer': 'bf_emma', 'hindi-comic': 'hm_omega'}


class CompatibleKokoroSession:
    """Match speed's dtype to the model export (kokoro-onnx 0.4.9 uses int32)."""
    def __init__(self, session, speed):
        self.session = session
        self.speed = speed

    def __getattr__(self, name):
        return getattr(self.session, name)

    def run(self, output_names, inputs):
        import numpy as np
        if any(item.name == 'speed' and item.type == 'tensor(float)' for item in self.session.get_inputs()):
            # Restore the requested fractional rate before the upstream int32
            # conversion can truncate 0.96 to zero.
            inputs = {**inputs, 'speed': np.asarray([self.speed], dtype=np.float32)}
        return self.session.run(output_names, inputs)


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--style', choices=['auto', *STYLES], default='auto')
    parser.add_argument('--engine', choices=['kokoro', 'microsoft'], default='kokoro')
    args = parser.parse_args()
    name = args.name.strip()
    if not name or len(name) > 50 or any(c in name for c in '\r\n<>'):
        parser.error('Use a short recipient name.')
    local = ROOT / '.local'
    local.mkdir(exist_ok=True)
    receipt = local / 'telegram-call-trial-receipt.json'
    if receipt.exists() and not json.loads(receipt.read_text()).get('endedAt'):
        raise RuntimeError('A call is still active. Do not replace its recording.')
    history = local / 'telegram-voice-style-history.json'
    previous = json.loads(history.read_text()) if history.exists() else {'next': 0}
    automatic_styles = [style for style in STYLES if args.engine == 'microsoft' or style != 'hindi-comic']
    style = automatic_styles[previous['next'] % len(automatic_styles)] if args.style == 'auto' else args.style
    voice, rate, pitch, sentence = STYLES[style]
    # Always disclose that this is an automated test. Never imply the person's
    # submission is missing without checking the actual app assignment.
    text = f'नमस्ते {name}। {sentence}' if style == 'hindi-comic' else f'Hi {name}. This is an automated Housekeeping test call. {sentence}'
    if args.engine == 'microsoft':
        import edge_tts
        source = local / 'telegram-call-test.mp3'
        await asyncio.wait_for(edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(str(source)), timeout=45)
    else:
        from kokoro_onnx import Kokoro
        import soundfile
        import onnxruntime
        model = local / 'kokoro/kokoro-v1.0.onnx'
        voices = local / 'kokoro/voices-v1.0.bin'
        if not model.exists() or not voices.exists():
            raise RuntimeError('Install the official Kokoro v1.0 model and voices in .local/kokoro first.')
        voice = KOKORO_VOICES[style]
        speed = 0.96 if style in ('hero', 'gentle') else 1.04
        options = onnxruntime.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        session = onnxruntime.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
        kokoro = Kokoro.from_session(session, str(voices))
        kokoro.sess = CompatibleKokoroSession(kokoro.sess, speed)
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang='hi' if style == 'hindi-comic' else 'en-gb' if voice.startswith('b') else 'en-us')
        source = local / 'telegram-call-test.wav'
        soundfile.write(str(source), samples, sample_rate)
    pcm = local / 'telegram-call-test.pcm'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', str(source), '-ar', '48000', '-ac', '1', '-f', 's16le', str(pcm)], check=True)
    seconds = pcm.stat().st_size / (48000 * 2)
    if not 1 <= seconds <= 30:
        raise RuntimeError('Generated recording is outside the 1–30 second trial limit. No call placed.')
    history.write_text(json.dumps({'next': previous['next'] + 1, 'lastStyle': style}))
    # Keep each generated sample locally so a later call cannot change the
    # recording used for an earlier result or quality comparison.
    import shutil
    samples_dir = local / 'telegram-voice-samples'
    samples_dir.mkdir(exist_ok=True)
    safe_name = ''.join(c for c in name if c.isalnum()) or 'recipient'
    shutil.copyfile(source, samples_dir / f'{safe_name}-{args.engine}-{style}{source.suffix}')
    (local / 'telegram-call-audio-metadata.json').write_text(json.dumps({'engine': args.engine, 'style': style, 'voice': voice, 'seconds': seconds, 'sha256': hashlib.sha256(pcm.read_bytes()).hexdigest()}))
    print(json.dumps({'engine': args.engine, 'style': style, 'voice': voice, 'seconds': round(seconds, 1), 'callsPlaced': 0}))


if __name__ == '__main__':
    asyncio.run(main())
