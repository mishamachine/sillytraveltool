#!/usr/bin/env python3
"""App Store screenshots from the demo build (used by .github/workflows/ios-store-shots.yml).

Drives one booted simulator through the demo screens and saves PNGs at native resolution, named in the
order the store listing should show them (01-trips-list, 02-trip-plan, 03-today, 04-guide, 05-honk,
06-tools, 07-documents). Then checks every PNG against Apple's accepted sizes, resizing and padding if needed.

env: UDID, OUT (dir), KIND (iphone|ipad), TRIP (text on the trip card, default "Spain")
The demo build is made with VITE_DEMO=1 VITE_DEMO_PARAMS=flagship=10, so the app opens on Today.
WKWebView content is not reliably in the accessibility tree, so each tap tries a label first and then a
position worked out from the screen size (the tab bar is five equal columns along the bottom).
"""
import json, os, re, struct, subprocess, sys, time

UDID = os.environ['UDID']
OUT = os.environ.get('OUT', 'shots')
KIND = os.environ.get('KIND', 'iphone')
TRIP = os.environ.get('TRIP', 'Spain')
BUNDLE = 'com.sillytraveltool.app'
# Accepted App Store sizes (width, height), portrait
ACCEPTED = {'iphone': [(1320, 2868), (1290, 2796)], 'ipad': [(2064, 2752), (2048, 2732)]}[KIND]
os.makedirs(OUT, exist_ok=True)
failures = []


def run(*args, check=True):
    print('$', ' '.join(args), flush=True)
    return subprocess.run(args, check=check, capture_output=True, text=True)


def elements():
    try:
        tree = json.loads(run('axe', 'describe-ui', '--udid', UDID, check=False).stdout)
    except ValueError:
        return []
    found = []

    def walk(node):
        if isinstance(node, dict):
            label = ' '.join(str(node.get(k) or '') for k in ('AXLabel', 'title', 'AXValue')).strip()
            frame = node.get('frame')
            if label and isinstance(frame, dict):
                found.append((label, frame))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(tree)
    return found


def screen_size():
    frames = [f for _, f in elements()]
    if not frames:
        return (440, 956) if KIND == 'iphone' else (1032, 1376)
    big = max(frames, key=lambda f: f['width'] * f['height'])
    return big['width'], big['height']


W, H = screen_size()
print(f'screen {W}x{H} pt', flush=True)


def tap_xy(x, y):
    run('axe', 'tap', '-x', str(round(x)), '-y', str(round(y)), '--udid', UDID, check=False)


def tap(text, fallback, exact=False, wait=3):
    """Tap the smallest element whose label matches text; else tap the fallback point (x, y in points)."""
    hits = [(l, f) for l, f in elements() if (l.strip() == text if exact else text.lower() in l.lower())]
    if hits:
        label, f = min(hits, key=lambda h: h[1]['width'] * h[1]['height'])
        print(f'tap "{label}"', flush=True)
        tap_xy(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2)
    else:
        print(f'no element "{text}"; tap fallback {fallback[0]:.0f},{fallback[1]:.0f}', flush=True)
        tap_xy(*fallback)
    time.sleep(wait)


def tab(index, name):
    tap(name, (W * (index + 0.5) / 5, H - 48), exact=True)


def swipe_up(amount=0.35):
    run('axe', 'swipe', '--start-x', str(round(W / 2)), '--start-y', str(round(H * 0.7)),
        '--end-x', str(round(W / 2)), '--end-y', str(round(H * (0.7 - amount))), '--udid', UDID, check=False)
    time.sleep(1.5)


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    return struct.unpack('>II', head[16:24]) if head[:8] == b'\x89PNG\r\n\x1a\n' else None


def fit(path):
    """Make the PNG exactly one of the accepted sizes: scale to fit the closest one, then pad."""
    size = png_size(path)
    if size in ACCEPTED:
        print(f'{os.path.basename(path)} {size[0]}x{size[1]} ok', flush=True)
        return
    tw, th = min(ACCEPTED, key=lambda a: abs(a[0] / a[1] - size[0] / size[1]))
    s = min(tw / size[0], th / size[1])
    run('sips', '-z', str(round(size[1] * s)), str(round(size[0] * s)), path, check=False)
    run('sips', '--padToHeightWidth', str(th), str(tw), '--padColor', 'F5EFE6', path, check=False)
    print(f'{os.path.basename(path)} {size[0]}x{size[1]} -> {png_size(path)}', flush=True)


def shot(name):
    path = f'{OUT}/{KIND}/{name}.png'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', path)
    fit(path)
    if png_size(path) not in ACCEPTED:
        failures.append(f'{KIND}/{name} is {png_size(path)}')
    return path


# Launch on Today (the demo trip is in progress)
run('xcrun', 'simctl', 'terminate', UDID, BUNDLE, check=False)
run('xcrun', 'simctl', 'launch', UDID, BUNDLE)
time.sleep(14)
shot('03-today')

tap('All trips', (W * 0.14, H * 0.07))
time.sleep(2)
shot('01-trips-list')

tap(TRIP, (W * 0.5, H * 0.3), wait=4)
swipe_up(0.3)  # down to the BCN -> BER flight and its two time zones
shot('02-trip-plan')

tab(0, 'Trips')  # closes the trip
tab(1, 'Guide'); time.sleep(3); shot('04-guide')
tab(2, 'HONK'); time.sleep(2); shot('05-honk')
tab(3, 'Tools'); time.sleep(2); shot('06-tools')
tab(4, 'Profile'); time.sleep(2)
tap('Travel documents', (W * 0.5, H * 0.72), wait=3)
shot('07-documents')

count = len([n for n in os.listdir(f'{OUT}/{KIND}') if n.endswith('.png')])
print(f'{count} screenshots in {OUT}/{KIND}', flush=True)
if failures:
    print('!! wrong size:', '; '.join(failures), flush=True)
sys.exit(1 if failures or count < 5 else 0)
