#!/usr/bin/env python3
"""플로우 매뉴얼용 주석 스크린샷 캡처 도구.

playwright-cli 세션에서 ①스크린샷을 찍고 ②지정 셀렉터들의 실제 픽셀 좌표를
DOM(getBoundingClientRect)에서 직접 측정해 ③빨간박스+번호 배지를 합성한다.
7월 주석본(docs/admin-manual/screenshots/annotated) 스타일과 일관.

usage:
  flowshot.py <session> <out.png> [--url URL] [--sel "css1" "css2" ...] [--pad 6]
  셀렉터 하나당 번호 1개(①②③…). 매칭 실패 셀렉터는 경고 후 건너뜀.
"""
import argparse, json, re, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

RED = (225, 40, 30)

def cli(session, *args):
    r = subprocess.run(['playwright-cli', f'-s={session}', *args],
                       capture_output=True, text=True, timeout=60)
    return r.stdout + r.stderr

def eval_json(session, js):
    out = cli(session, 'eval', js)
    m = re.search(r'### Result\n"(.*)"\n', out, re.S)
    if not m:
        m = re.search(r'### Result\n(.+?)\n### ', out, re.S) or re.search(r'### Result\n(.+)', out)
    if not m:
        raise SystemExit(f'eval 결과 파싱 실패:\n{out[:600]}')
    raw = m.group(1)
    # playwright-cli 는 문자열 결과를 JSON 인코딩해 출력한다
    try:
        return json.loads(json.loads(f'"{raw}"') if raw.startswith('[') is False else raw)
    except Exception:
        return json.loads(raw.encode().decode('unicode_escape'))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('session'); ap.add_argument('out')
    ap.add_argument('--url'); ap.add_argument('--sel', nargs='*', default=[])
    ap.add_argument('--pad', type=int, default=6)
    ap.add_argument('--scroll-to', help='캡처 전 이 셀렉터로 스크롤')
    a = ap.parse_args()

    if a.url:
        cli(a.session, 'goto', a.url)
    if a.scroll_to:
        st = a.scroll_to
        if st.startswith('text='):
            js = ("() => { const t = %s; const el = [...document.querySelectorAll('button,a,label,h2,h3,p,section,div')]"
                  ".find(e => e.innerText && e.innerText.trim().startsWith(t) && e.getClientRects().length > 0);"
                  " if (el) el.scrollIntoView({block:'center'}); return 'ok'; }" % json.dumps(st[5:].strip()))
        else:
            js = ("() => { const el = document.querySelector(%s); if (el) { el.scrollIntoView({block:'center'}); } return 'ok'; }"
                  % json.dumps(st))
        cli(a.session, 'eval', js)
        import time; time.sleep(0.4)

    rects = []
    if a.sel:
        js = ("() => JSON.stringify(%s.map(s => {"
              " let el;"
              " if (s.startsWith('text=')) {"
              "   const t = s.slice(5).trim();"
              "   el = [...document.querySelectorAll('button,a,label,[role=radio],[role=button],span,p,h1,h2,h3')]"
              "     .find(e => e.innerText && e.innerText.replace(/\\s+/g,' ').trim().startsWith(t) && e.getClientRects().length > 0);"
              " } else { el = document.querySelector(s); }"
              " if (!el) return null; const r = el.getBoundingClientRect();"
              " return { x: r.x, y: r.y, w: r.width, h: r.height }; }))"
              % json.dumps(a.sel))
        rects = eval_json(a.session, js)

    shot = cli(a.session, 'screenshot')
    m = re.search(r'(\.playwright-cli/page-[\w.-]+\.png)', shot)
    if not m:
        raise SystemExit(f'스크린샷 경로 파싱 실패:\n{shot[:400]}')
    shot_path = m.group(1)
    if not os.path.exists(shot_path):
        # playwright-cli 는 세션이 열린 디렉터리 기준 상대경로를 출력한다 — 후보 탐색
        base = os.path.basename(shot_path)
        for root in ('.playwright-cli', 'artifacts/manuals/.playwright-cli',
                     os.path.expanduser('~/.playwright-cli')):
            cand = os.path.join(root, base)
            if os.path.exists(cand):
                shot_path = cand
                break
    img = Image.open(shot_path).convert('RGB')
    W, H = img.size
    # 뷰포트 CSS px 대비 스크린샷 배율(레티나 등)
    vw = eval_json(a.session, "() => JSON.stringify([window.innerWidth, window.innerHeight])")
    scale = W / vw[0]

    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', int(17 * scale))
    except OSError:
        font = ImageFont.load_default()

    n = 0
    for i, r in enumerate(rects):
        if not r:
            print(f'⚠ 셀렉터 매칭 실패(건너뜀): {a.sel[i]}', file=sys.stderr)
            continue
        n += 1
        x1 = r['x'] * scale - a.pad; y1 = r['y'] * scale - a.pad
        x2 = (r['x'] + r['w']) * scale + a.pad; y2 = (r['y'] + r['h']) * scale + a.pad
        d.rounded_rectangle([x1, y1, x2, y2], radius=int(6 * scale), outline=RED, width=max(3, int(2.2 * scale)))
        # 번호 배지 — 박스 왼쪽 위 바깥
        br = int(13 * scale)
        bx = max(br + 2, x1); by = max(br + 2, y1 - br * 0.4)
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=RED)
        t = str(n)
        tw = d.textlength(t, font=font)
        d.text((bx - tw / 2, by - int(11 * scale)), t, font=font, fill=(255, 255, 255))

    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    img.save(a.out)
    print(f'저장: {a.out} ({W}x{H}, 박스 {n}개)')

if __name__ == '__main__':
    main()
