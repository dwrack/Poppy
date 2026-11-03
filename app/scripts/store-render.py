import os, sys, subprocess, time, importlib.util
D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('c', os.path.join(D, 'store-catalog.py')); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
CLI = os.path.expanduser('~/Projects/poppy-photoreal/.venv/bin/mflux-generate-qwen-2.1')
env = dict(os.environ, HF_HUB_OFFLINE='1')
only = set(sys.argv[1:])
for store in m.S.values():
    for it in store['items']:
        iid, look = it[0], it[11]
        if only and iid not in only: continue
        out = f'{D}/raw/{iid}.png'
        if os.path.exists(out): continue
        while subprocess.run(['pgrep', '-f', 'mflux-generate-qwen-2.1-edit|studio.worker|studio.cli run'], capture_output=True).returncode == 0: time.sleep(15)
        prompt = (f'Catalog product photo of a single item: {look}. Laid out flat on a plain pure white background, '
                  'nobody wearing it, no mannequin, no person, no hands, no text, no logo. Soft even studio lighting, '
                  'the whole item visible with white space around it, centered.')
        r = subprocess.run([CLI, '--model', 'qwen-image-2.1-turbo', '--steps', '8', '--quantize', '4', '--low-ram',
                            '--width', '768', '--height', '1024', '--seed', '7', '--prompt', prompt, '--output', out],
                           stdout=open(f'{D}/logs/{iid}.log', 'w'), stderr=subprocess.STDOUT, env=env)
        print(iid, 'ok' if r.returncode == 0 else f'FAIL rc={r.returncode}', flush=True)
print('DONE', flush=True)
