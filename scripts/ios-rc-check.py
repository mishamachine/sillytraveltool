#!/usr/bin/env python3
"""CI-only (ci/revenuecat-iphone): RevenueCat Test Store purchase on the iPhone Simulator.
Usage: ios-rc-check.py buy|cc   (UDID and OUT from env). The app's ciRevenueCat hook starts the flow ~12 s after
launch; this script screenshots it and taps the native Test Store alert's "valid purchase" button."""
import json, os, subprocess, sys, time

UDID, OUT, MODE = os.environ['UDID'], os.environ.get('OUT', 'shots'), sys.argv[1]
os.makedirs(OUT, exist_ok=True)
run = lambda *a: subprocess.run(a, capture_output=True, text=True)

def ui():
    return run('axe', 'describe-ui', '--udid', UDID).stdout

def shot(name):
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', f'{OUT}/{MODE}-{name}.png')
    open(f'{OUT}/{MODE}-{name}.ui.json', 'w').write(ui())

def find(words):
    try: tree = json.loads(ui())
    except ValueError: return None
    hits = []
    def walk(n):
        if isinstance(n, dict):
            label = ' '.join(str(n.get(k) or '') for k in ('AXLabel', 'title')).strip()
            if label and isinstance(n.get('frame'), dict) and all(w in label.lower() for w in words): hits.append((label, n['frame']))
            for v in n.values(): walk(v)
        elif isinstance(n, list):
            for v in n: walk(v)
    walk(tree)
    return min(hits, key=lambda h: h[1]['width'] * h[1]['height']) if hits else None

run('xcrun', 'simctl', 'launch', UDID, 'com.sillytraveltool.app')
time.sleep(9)
shot('1-launch')
if MODE == 'buy':
    hit = None
    for _ in range(40):
        hit = find(['valid'])
        if hit: break
        time.sleep(1)
    shot('2-store-sheet')
    if hit:
        label, f = hit
        x, y = f['x'] + f['width'] / 2, f['y'] + f['height'] / 2
        print(f'tap "{label}" at {x:.0f},{y:.0f}', flush=True)
        run('axe', 'tap', '-x', str(round(x)), '-y', str(round(y)), '--udid', UDID)
    else:
        print('Test Store sheet not found', flush=True)
    time.sleep(10)
    shot('3-after')
else:
    time.sleep(15)
    shot('2-customer-center')
    run('xcrun', 'simctl', 'ui', UDID, 'appearance', 'dark')
    time.sleep(3)
    shot('3-customer-center-dark')
