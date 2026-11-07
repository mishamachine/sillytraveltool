#!/usr/bin/env python3
"""App Store screenshots from the demo build (used by .github/workflows/ios-store-shots.yml).

Drives one booted simulator through the demo screens and saves PNGs at native resolution, named in the
order the store listing should show them (01-trips-list, 02-trip-plan, 03-today, 04-guide, 05-honk,
06-tools, 07-documents). Then checks every PNG against Apple's accepted sizes, resizing and padding if needed.

env: UDID, OUT (dir), KIND (iphone|ipad), 
The demo build is made with VITE_DEMO=1 VITE_DEMO_PARAMS=consent=reject, so the app opens on Today with the usage-stats
banner already answered. Taps do not reach the WKWebView, so each screen is opened through the demo deep link.
"""
import json, os, re, struct, subprocess, sys, time, zlib

UDID = os.environ['UDID']
OUT = os.environ.get('OUT', 'shots')
KIND = os.environ.get('KIND', 'iphone')
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


def go(query, wait=4):
    """Drive the demo app through its deep link (src/dev/demoNav.js); taps don't reach the WKWebView."""
    run('xcrun', 'simctl', 'openurl', UDID, f'{BUNDLE}://demo?{query}', check=False)
    end = time.time() + 6
    while time.time() < end:  # iOS asks "Open in Silly Travel Tool?" for custom-scheme links
        hits = [f for l, f in elements() if l.strip() == 'Open']
        if hits:
            f = min(hits, key=lambda f: f['width'] * f['height'])
            run('axe', 'tap', '-x', str(round(f['x'] + f['width'] / 2)), '-y', str(round(f['y'] + f['height'] / 2)), '--udid', UDID, check=False)
            break
        time.sleep(1)
    time.sleep(wait)


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


def flatten_rgb(path, bg=(0xF5, 0xEF, 0xE6)):
    """Rewrite the PNG as 8-bit RGB with no alpha channel (App Store Connect rejects/flags transparency)."""
    data = open(path, 'rb').read()
    pos, idat, ihdr = 8, b'', None
    while pos < len(data):
        n, typ = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if typ == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', body)
        elif typ == b'IDAT':
            idat += body
        pos += 12 + n
    w, h, depth, ctype, _, _, interlace = ihdr
    if depth != 8 or interlace or ctype not in (2, 6):
        raise SystemExit(f'cannot flatten {path}: unsupported PNG {ihdr}')
    bpp = 4 if ctype == 6 else 3
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    out = bytearray()
    i = 0
    for _ in range(h):
        f = raw[i]; row = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = row[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1: row[x] = (row[x] + a) & 255
            elif f == 2: row[x] = (row[x] + b) & 255
            elif f == 3: row[x] = (row[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                row[x] = (row[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = row
        if bpp == 4:
            rgb = bytearray(w * 3)
            for x in range(w):
                al = row[x * 4 + 3]
                for k in range(3):
                    rgb[x * 3 + k] = (row[x * 4 + k] * al + bg[k] * (255 - al)) // 255
            out += b'\x00' + rgb
        else:
            out += b'\x00' + row
    def chunk(t, b):
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(bytes(out), 6)) + chunk(b'IEND', b''))


def shot(name):
    path = f'{OUT}/{KIND}/{name}.png'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', path)
    fit(path)
    flatten_rgb(path)
    if png_size(path) not in ACCEPTED:
        failures.append(f'{KIND}/{name} is {png_size(path)}')
    return path


# Permissions are granted up front so no iOS prompt (location) lands on a screenshot; the demo trip is in Granada
for svc in ('location', 'location-always', 'photos', 'camera', 'notifications'):
    run('xcrun', 'simctl', 'privacy', UDID, 'grant', svc, BUNDLE, check=False)
run('xcrun', 'simctl', 'location', UDID, 'set', '37.1773,-3.5986', check=False)


def is_blank(path):
    """A flat screen compresses to a tiny PNG; real app screens are far bigger."""
    return os.path.getsize(path) < 150_000


# Launch on Today (the demo trip is in progress). The first cold start can show only the splash colour,
# so retry with a relaunch until the screen has content.
for attempt in range(4):
    run('xcrun', 'simctl', 'terminate', UDID, BUNDLE, check=False)
    run('xcrun', 'simctl', 'launch', UDID, BUNDLE)
    time.sleep(14 + 6 * attempt)
    path = shot('03-today')
    if not is_blank(path):
        break
    print(f'03-today looks blank (attempt {attempt + 1}), relaunching', flush=True)
else:
    failures.append(f'{KIND}/03-today is blank')

go('trips=list')
shot('01-trips-list')
go('trip=trip-spain', wait=6)  # Plan tab: SEA -> MAD flight with its two time zones
shot('02-trip-plan')
go('trip=close&tab=guide', wait=6)
shot('04-guide')
go('tab=honk')
shot('05-honk')
go('tab=tools')
shot('06-tools')
go('tab=profile&profile=docs')
shot('07-documents')

# No two screenshots may be the same picture (the previous run produced seven copies of Today)
import hashlib
files = sorted(n for n in os.listdir(f'{OUT}/{KIND}') if n.endswith('.png'))
digests = {}
for n in files:
    digests.setdefault(hashlib.sha256(open(f'{OUT}/{KIND}/{n}', 'rb').read()).hexdigest(), []).append(n)
for names in digests.values():
    if len(names) > 1:
        failures.append('identical: ' + ', '.join(names))
for n in files:
    if is_blank(f'{OUT}/{KIND}/{n}'):
        failures.append('blank: ' + n)
count = len(files)
print(f'{count} screenshots in {OUT}/{KIND}', flush=True)
if failures:
    print('!! ', '; '.join(failures), flush=True)
sys.exit(1 if failures or count < 7 else 0)
