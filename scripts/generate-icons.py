"""Generate the KitBash KVM toolbar icon set (SVG) in the logo's style:
thick rounded strokes / filled shapes with a heavy dark outline, logo palette accents,
and small stencil gaps like the cuts in the KITBASH letterforms.

Each part: (svg element string without stroke/fill, stroke color or None, fill color or None, outline?)
Rendered as: dark outline layer for all outlined parts, then the colored layer on top.
"""
import os
import sys

# Usage: python scripts/generate-icons.py src/assets/icons
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

G = '#cfcfcf'  # light kitbash gray (logo #777 is too dark on the toolbar)
O = '#ffa01e'  # logo orange
R = '#ff3f1e'  # logo red-orange
N = '#004264'  # logo navy
K = '#0b0b0b'  # outline
SW = 2.25  # color stroke width
OW = 4.6  # outline stroke width


def P(d):
    return f'<path d="{d}"/>'


def C(cx, cy, r):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'


def RECT(x, y, w, h, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>'


def part(el, stroke=G, fill=None, outline=True):
    return (el, stroke, fill, outline)


def svg(parts):
    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        'stroke-linecap="round" stroke-linejoin="round">'
    ]
    outline = [p for p in parts if p[3]]
    if outline:
        out.append(f'<g stroke="{K}" stroke-width="{OW}">')
        for el, stroke, fill, _ in outline:
            out.append(el.replace('/>', f' fill="{K if fill else "none"}"/>'))
        out.append('</g>')
    out.append(f'<g stroke-width="{SW}">')
    for el, stroke, fill, _ in parts:
        attrs = f' stroke="{stroke or "none"}" fill="{fill or "none"}"'
        out.append(el.replace('/>', attrs + '/>'))
    out.append('</g></svg>')
    return ''.join(out) + '\n'


def dots(points, color):
    return [part(P(f'M{x},{y}h0'), color) for x, y in points]


corners_out = 'M4,9V4H9 M15,4H20V9 M20,15V20H15 M9,20H4V15'
corners_in = 'M9,4.5V9H4.5 M15,4.5V9H19.5 M19.5,15H15V19.5 M4.5,15H9V19.5'
scan_corners = 'M3.5,8V3.5H8 M16,3.5H20.5V8 M20.5,16V20.5H16 M8,20.5H3.5V16'
eye = 'M2.5,12C5.5,6.5 18.5,6.5 21.5,12C18.5,17.5 5.5,17.5 2.5,12Z'
pin_body = 'M9,3.5H15 M10.25,3.5V8.5L7,12.5H17L13.75,8.5V3.5'

ICONS = {
    # media sources
    'video-source': [
        part(RECT(3, 4, 18, 12, 2), G, N),
        part(P('M12,16V19.5 M8,20H16')),
        part(P('M6.5,12.5L9,10'), O),
    ],
    'audio-source': [
        part(P('M3.5,9.5H7L11.5,5.5V18.5L7,14.5H3.5Z'), G, G),
        part(P('M15,9A4,4 0 0 1 15,15'), O),
        part(P('M17.5,6.5A7.5,7.5 0 0 1 17.5,17.5'), R),
    ],
    'microphone': [
        part(RECT(9, 3, 6, 11, 3), G, N),
        part(P('M5.5,11.5A6.5,6.5 0 0 0 18.5,11.5')),
        part(P('M12,18V21'), O),
    ],
    'warning': [
        part(P('M12,3.5L21,19.5H3Z'), O, O),
        part(P('M12,9.5V13.5'), K, None, False),
        part(P('M12,16.75h0'), K, None, False),
    ],
    # stream control
    'play': [part(P('M8,5L19,12L8,19Z'), O, O)],
    'stop': [part(RECT(6, 6, 12, 12, 2), R, R)],
    'reset': [
        part(P('M19,12A7,7 0 1 1 16.95,7.05')),
        part(P('M19,4.5V8H15.5'), G),
        part(P('M9.75,9.75L14.25,14.25 M14.25,9.75L9.75,14.25'), R),
    ],
    # capture tools
    'screenshot': [
        part(P('M8.5,7.5L10,5H14L15.5,7.5'), G),
        part(RECT(3, 7.5, 18, 12.5, 2.5), G, N),
        part(C(12, 13.75, 3.25), O),
        part(P('M17.5,10.5h0'), R),
    ],
    'ocr': [
        part(P(scan_corners)),
        # stencil-cut T, like the logo's I/T
        part(P('M8,8.5H16'), O),
        part(P('M12,11V16'), O),
    ],
    'qr-scan': [
        part(RECT(4, 4, 6, 6, 1), G, N),
        part(RECT(14, 4, 6, 6, 1), G, N),
        part(RECT(4, 14, 6, 6, 1), G, N),
        *dots([(14.5, 14.5), (19.5, 19.5)], O),
        *dots([(19.5, 14.5), (14.5, 19.5)], R),
        part(P('M17,17h0'), G),
    ],
    'record': [
        part(C(12, 12, 8)),
        part(C(12, 12, 3.25), R, R),
    ],
    'recording': [
        part(C(12, 12, 8), R),
        part(C(12, 12, 4.5), R, R),
    ],
    # KVM input
    'serial-connect': [
        part(P('M10,8V4.5 M14,8V4.5')),
        part(P('M7.5,8H16.5V11.5A4.5,4.5 0 0 1 7.5,11.5Z'), G, N),
        part(P('M12,16V20.5'), O),
    ],
    'serial-disconnect': [
        part(P('M10,8V4.5 M14,8V4.5')),
        part(P('M7.5,8H16.5V11.5A4.5,4.5 0 0 1 7.5,11.5Z'), G, N),
        part(P('M12,16V17.25 M12,19.75V20.5'), O),
        part(P('M4,20L20,4'), R),
    ],
    'text-transfer': [
        part(RECT(5, 4.5, 14, 16.5, 2), G, N),
        part(RECT(9, 2.75, 6, 3, 1), O, O),
        part(P('M8.5,11H15.5 M8.5,14.5H13'), G),
        part(P('M15.5,17.5h0'), R),
    ],
    'hotkeys': [
        part(RECT(2.5, 6.5, 19, 11, 2), G, N),
        *dots([(6, 10), (9.5, 10), (13, 10)], G),
        *dots([(18, 10)], R),
        part(P('M8,14H16'), O),
    ],
    'media-keys': [
        part(P('M3.5,6L11.5,12L3.5,18Z'), O, O),
        part(P('M15.5,6.5V17.5')),
        part(P('M20,6.5V17.5'), R),
    ],
    'macros': [
        part(RECT(3.5, 3.5, 12, 17, 2), G, N),
        part(P('M7,8H12 M7,11.5H10.5'), G),
        part(P('M14,13L21,17L14,21Z'), O, O),
    ],
    # app
    'settings': [
        part(P(' '.join(
            f'M{12 + 6.5 * c:.2f},{12 + 6.5 * s:.2f}L{12 + 9 * c:.2f},{12 + 9 * s:.2f}'
            for c, s in [(1, 0), (0.7071, 0.7071), (0, 1), (-0.7071, 0.7071),
                         (-1, 0), (-0.7071, -0.7071), (0, -1), (0.7071, -0.7071)]))),
        part(C(12, 12, 6), G, N),
        part(C(12, 12, 2.25), O, O),
    ],
    'video-only': [
        part(P(eye), G, N),
        part(C(12, 12, 2.75), O, O),
    ],
    'video-only-off': [
        part(P(eye), G, N),
        part(C(12, 12, 2.75), O, O),
        part(P('M4,20L20,4'), R),
    ],
    'fullscreen': [
        part(P(corners_out)),
        part(RECT(9, 9, 6, 6, 1), O, N),
    ],
    'fullscreen-exit': [part(P(corners_in), O)],
    'pin': [
        part(P(pin_body), R, R),
        part(P('M12,12.5V20.5'), G),
    ],
    'pin-off': [
        part(P(pin_body), G, N),
        part(P('M12,12.5V15 M12,17.5V20.5'), G),
    ],
    'loading': [
        part(P('M12,3.5A8.5,8.5 0 0 1 20.5,12'), O),
        part(P('M18.01,18.01A8.5,8.5 0 0 1 5.99,18.01'), R),
        part(P('M3.5,12A8.5,8.5 0 0 1 5.99,5.99'), G),
    ],
}

for name, parts in ICONS.items():
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg(parts))

print(f'wrote {len(ICONS)} icons to {OUT}')
