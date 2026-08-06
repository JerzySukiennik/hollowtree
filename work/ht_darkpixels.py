"""Find connected clusters of near-black pixels in the tree renders.

Acceptance: no connected cluster of luma < 0.05 larger than 100 px anywhere
outside the aperture bounding box.
"""
import sys, zlib, struct
from collections import deque


def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    off, idat, w, h, bd, ct = 8, b'', 0, 0, 0, 0
    while off < len(d):
        ln = struct.unpack_from('>I', d, off)[0]
        typ = d[off + 4:off + 8]
        chunk = d[off + 8:off + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', chunk[:10])
        elif typ == b'IDAT':
            idat += chunk
        off += 12 + ln
    raw = zlib.decompress(idat)
    nch = {0: 1, 2: 3, 4: 2, 6: 4}[ct]
    bpp = nch * (bd // 8)
    stride = w * bpp
    out = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            x = line[i]
            if f == 1:
                x += a
            elif f == 2:
                x += b
            elif f == 3:
                x += (a + b) >> 1
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                x += a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[i] = x & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line
    step = bd // 8
    return w, h, nch, step, bytes(out), stride


def luma_mask(path, thr=0.05):
    w, h, nch, step, px, stride = read_png(path)
    mask = bytearray(w * h)
    lim = int(thr * 255)
    for y in range(h):
        base = y * stride
        for x in range(w):
            o = base + x * nch * step
            r, g, b = px[o], px[o + step] if nch > 1 else px[o], px[o + 2 * step] if nch > 2 else px[o]
            if (0.2126 * r + 0.7152 * g + 0.0722 * b) < lim:
                mask[y * w + x] = 1
    return w, h, mask


def clusters(w, h, mask, min_size=1):
    seen = bytearray(w * h)
    out = []
    for i in range(w * h):
        if not mask[i] or seen[i]:
            continue
        q = deque([i])
        seen[i] = 1
        cells = []
        while q:
            c = q.popleft()
            cells.append(c)
            cy, cx = divmod(c, w)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        if len(cells) >= min_size:
            ys = [c // w for c in cells]
            xs = [c % w for c in cells]
            out.append((len(cells), min(xs), max(xs), min(ys), max(ys)))
    out.sort(reverse=True)
    return out


if __name__ == '__main__':
    for path in sys.argv[1:]:
        w, h, mask = luma_mask(path)
        cl = clusters(w, h, mask, min_size=40)
        print('%-24s %dx%d  clusters(luma<0.05, >=40px): %d'
              % (path.split('/')[-1], w, h, len(cl)))
        for n, x0, x1, y0, y1 in cl[:6]:
            print('    %5d px  x %4d..%-4d  y %4d..%-4d  (%dx%d)'
                  % (n, x0, x1, y0, y1, x1 - x0 + 1, y1 - y0 + 1))
