#!/usr/bin/env python3
import fitz
import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
ASSET_ROOT = ROOT / 'assets' / 'cbt' / 'ergonomics'
PDF_ROOT = Path('/mnt/data')

SUBJECTS = [
    {'name': '인간공학개론', 'range': [1, 20]},
    {'name': '작업생리학', 'range': [21, 40]},
    {'name': '산업심리학 및 관계법규', 'range': [41, 60]},
    {'name': '근골격계질환 예방을 위한 작업관리', 'range': [61, 80]},
]
CIRCLE_TO_NUM = {'①': 1, '②': 2, '③': 3, '④': 4, '❶': 1, '❷': 2, '❸': 3, '❹': 4}
NORMAL_CIRCLE = {1: '①', 2: '②', 3: '③', 4: '④'}
VISUAL_RE = re.compile(r'(다음\s*(그림|도표|표|식)|그림은|그림과|그림에서|표와\s*같|표를\s*참고|다음에서\s*설명|다음과\s*같은\s*(그림|표|식)|심볼|도식|블록도|회로|아래\s*(그림|표|식))')
BOILER = (
    '전자문제집 CBT 홈페이지', '기출문제 및 해설집 다운로드', '전자문제집 CBT 앱',
    '전자문제집 CBT란?', '종이 문제집이 아닌', '인터넷으로 종이 없이',
    '오답 및 오탈자가 수정된', '최강 자격증 기출문제 전자문제집 CBT',
    '기출문제 해설은 최강 자격증'
)


def date_from_name(path: Path):
    m = re.search(r'(20\d{2})(\d{2})(\d{2})', path.name)
    if not m:
        raise ValueError(f'날짜 추출 실패: {path.name}')
    y, mo, d = m.groups()
    return f'{y}-{mo}-{d}', int(y), int(mo), int(d)


def subject_for(no):
    for s in SUBJECTS:
        if s['range'][0] <= no <= s['range'][1]:
            return s['name']
    return SUBJECTS[-1]['name']


def clean_line(s):
    s = s.replace('\u00a0', ' ').replace('\ufeff', '')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def skip_line(txt):
    if not txt:
        return True
    if any(k in txt for k in BOILER):
        return True
    if re.search(r'^\s*\d과목\s*:', txt):
        return True
    if '인간공학기사' in txt and '필기 기출문제' in txt:
        return True
    if txt.startswith('본 해설집은') or txt.startswith('해설을 제공해 주신'):
        return True
    return False


def extract_ordered_questions(pdf_path: Path):
    doc = fitz.open(pdf_path)
    qrec = {i: {'body': [], 'expl': [], 'regions': defaultdict(lambda: [1e9, -1e9])} for i in range(1, 81)}
    expected = 1
    current = None
    stop = False

    for pno, page in enumerate(doc):
        if stop:
            break
        mid = page.rect.width / 2
        page_lines = []
        d = page.get_text('dict')
        for block in d.get('blocks', []):
            for line in block.get('lines', []):
                spans = line.get('spans', [])
                if not spans:
                    continue
                txt = clean_line(''.join(sp.get('text', '') for sp in spans))
                if not txt:
                    continue
                x0, y0, x1, y1 = line['bbox']
                if y0 < 48 or y1 > page.rect.height - 14:
                    continue
                # dominant color; questions are black (0), explanations in 해설집 are blue (255)
                colors = [sp.get('color', 0) for sp in spans if sp.get('text', '').strip()]
                color = colors[0] if colors else 0
                col = 0 if (x0 + x1) / 2 < mid else 1
                page_lines.append((col, y0, x0, y1, txt, color))

        for col in (0, 1):
            lines = sorted((r for r in page_lines if r[0] == col), key=lambda z: (z[1], z[2]))
            for _, y0, x0, y1, txt, color in lines:
                if current == 80 and any(k in txt for k in BOILER[:4]):
                    stop = True
                    break
                if skip_line(txt):
                    continue

                m = re.match(r'^(\d{1,2})\.\s*(.*)', txt)
                is_black = color == 0
                if m and is_black and int(m.group(1)) == expected:
                    current = expected
                    expected += 1
                    qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip())
                    key = (pno, col)
                    qrec[current]['regions'][key][0] = min(qrec[current]['regions'][key][0], y0)
                    qrec[current]['regions'][key][1] = max(qrec[current]['regions'][key][1], y1)
                    continue

                if current is None:
                    continue

                # Avoid answer-table junk after final question.
                if current == 80 and re.fullmatch(r'(?:\d{1,2}\s+){4,}\d{1,2}', txt):
                    continue
                if current == 80 and len(re.findall(r'[①②③④]', txt)) >= 5:
                    continue

                key = (pno, col)
                if color == 255 or txt.startswith('<문제 해설>') or txt.startswith('[해설'):
                    qrec[current]['expl'].append(txt)
                elif is_black:
                    qrec[current]['body'].append(txt)
                    qrec[current]['regions'][key][0] = min(qrec[current]['regions'][key][0], y0)
                    qrec[current]['regions'][key][1] = max(qrec[current]['regions'][key][1], y1)
            if stop:
                break

    doc.close()
    return qrec, expected - 1


def extract_answer_table(pdf_path: Path):
    text = subprocess.check_output(['pdftotext', '-layout', str(pdf_path), '-'], text=True, encoding='utf-8', errors='replace')
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if '오답 및 오탈자가 수정된' in line:
            start = i
    tail = lines[start:] if start else lines[-220:]
    answers = []
    # The answer table is eight rows of ten circled answers. On some PDFs the
    # left column still contains question choices on the same text line, so
    # keep the rightmost ten circles from each table row.
    for line in tail:
        toks = re.findall(r'[①②③④]', line)
        if len(toks) >= 10:
            answers.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
    if len(answers) != 80:
        answers = []
        for line in lines[-250:]:
            toks = re.findall(r'[①②③④]', line)
            if len(toks) >= 10:
                answers.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
    if len(answers) != 80:
        raise ValueError(f'정답표 80개 추출 실패: {pdf_path.name} -> {len(answers)}개')
    return answers


def join_text(lines):
    out = ' '.join(clean_line(x) for x in lines if clean_line(x))
    out = re.sub(r'\s+', ' ', out).strip()
    # common OCR/layout cleanup
    out = out.replace('ㆍ', '·')
    out = re.sub(r'\s+([,.:;?%)])', r'\1', out)
    out = re.sub(r'([(])\s+', r'\1', out)
    return out


def parse_question(no, body_lines, answer):
    raw = join_text(body_lines)
    raw = re.sub(rf'^{no}\.\s*', '', raw)
    # Markers include teacher-answer filled circles and normal circles.
    matches = list(re.finditer(r'[①②③④❶❷❸❹]', raw))
    if len(matches) >= 4:
        first = matches[0].start()
        question = raw[:first].strip()
        # Use the first four option markers; content runs until the next selected marker.
        choices = []
        for i in range(4):
            st = matches[i].end()
            en = matches[i + 1].start() if i < 3 else len(raw)
            choices.append(raw[st:en].strip())
    else:
        question = raw.strip()
        choices = []

    # If extraction missed image-only choices, keep four clickable slots and rely on source crop.
    while len(choices) < 4:
        choices.append(f'원문 보기 {NORMAL_CIRCLE[len(choices)+1]} (그림 참조)')
    choices = choices[:4]
    for i, c in enumerate(choices):
        if not c or c in {'-', '·'}:
            choices[i] = f'원문 보기 {NORMAL_CIRCLE[i+1]} (그림 참조)'

    if not question:
        question = f'{no}번 문제 (원문 그림 참조)'
    return question, choices


def clean_explanation(lines, answer, choice):
    if lines:
        parts = []
        for x in lines:
            t = clean_line(x)
            if not t or t == '<문제 해설>':
                continue
            if t.startswith('[해설작성자'):
                continue
            if t.startswith('본 해설집') or t.startswith('기출문제 해설은'):
                continue
            parts.append(t)
        text = ' '.join(parts)
        text = re.sub(r'\[해설작성자[^\]]*\]', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        if text:
            # keep source explanation useful but bounded for the CBT review screen
            return text[:900]
    c = choice.strip()
    if len(c) > 140:
        c = c[:137] + '...'
    return f"정답은 {answer}번 ‘{c}’입니다. 원문 기출문제의 최종 정답표를 기준으로 반영했습니다."


def region_has_graphic(doc, pno, col, y0, y1):
    page = doc[pno]
    mid = page.rect.width / 2
    x0 = 22 if col == 0 else mid + 5
    x1 = mid - 5 if col == 0 else page.rect.width - 22
    region = fitz.Rect(x0, max(48, y0 - 4), x1, min(page.rect.height - 14, y1 + 4))
    # Raster images
    for b in page.get_text('dict').get('blocks', []):
        if b.get('type') == 1:
            r = fitz.Rect(b['bbox'])
            if r.intersects(region) and r.width > 15 and r.height > 12:
                return True
    # Vector drawings (boxes, diagrams, charts). Ignore very thin separators.
    for d in page.get_drawings():
        r = d.get('rect')
        if not r or not r.intersects(region):
            continue
        ir = r & region
        if ir.width > 18 and ir.height > 8:
            return True
    return False


def make_source_crop(pdf_path, date, no, regions):
    doc = fitz.open(pdf_path)
    pieces = []
    for (pno, col), (y0, y1) in sorted(regions.items()):
        if y1 <= y0 or y0 > 1e8:
            continue
        page = doc[pno]
        mid = page.rect.width / 2
        x0 = 25 if col == 0 else mid + 6
        x1 = mid - 6 if col == 0 else page.rect.width - 25
        clip = fitz.Rect(x0, max(48, y0 - 8), x1, min(page.rect.height - 14, y1 + 8))
        if clip.width < 30 or clip.height < 20:
            continue
        pix = page.get_pixmap(matrix=fitz.Matrix(1.55, 1.55), clip=clip, alpha=False)
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        pieces.append(img)
    doc.close()
    if not pieces:
        return None

    maxw = max(im.width for im in pieces)
    gap = 8
    totalh = sum(im.height for im in pieces) + gap * (len(pieces) - 1)
    canvas = Image.new('RGB', (maxw, totalh), 'white')
    y = 0
    for im in pieces:
        x = (maxw - im.width) // 2
        canvas.paste(im, (x, y))
        y += im.height + gap

    out_dir = ASSET_ROOT / date
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'q{no:02d}.png'
    canvas.save(out, 'PNG', optimize=True)
    return out, canvas.width, canvas.height


def should_crop(question, choices, graphic):
    if graphic:
        return True
    if VISUAL_RE.search(question):
        return True
    if any('그림 참조' in c for c in choices):
        return True
    return False


def body_marker_answer(body_lines):
    raw = join_text(body_lines)
    m = re.search(r'[❶❷❸❹]', raw)
    return CIRCLE_TO_NUM[m.group()] if m else None


def import_one(pdf_path: Path):
    date, y, mo, d = date_from_name(pdf_path)
    qrec, count = extract_ordered_questions(pdf_path)
    if count != 80:
        raise ValueError(f'{pdf_path.name}: 문항 시작 80개 아님 ({count})')
    answers = extract_answer_table(pdf_path)
    doc = fitz.open(pdf_path)

    questions = []
    stats = {'visual': 0, 'choice_repairs': 0, 'body_answer_mismatch': 0}
    for no in range(1, 81):
        rec = qrec[no]
        answer = answers[no - 1]
        question, choices = parse_question(no, rec['body'], answer)
        if any('그림 참조' in c for c in choices):
            stats['choice_repairs'] += 1
        bm = body_marker_answer(rec['body'])
        if bm is not None and bm != answer:
            stats['body_answer_mismatch'] += 1

        graphic = False
        for (pno, col), (ry0, ry1) in rec['regions'].items():
            if ry1 > ry0 and region_has_graphic(doc, pno, col, ry0, ry1):
                graphic = True
                break

        q = {
            'no': no,
            'subject': subject_for(no),
            'question': question,
        }
        if should_crop(question, choices, graphic):
            crop = make_source_crop(pdf_path, date, no, rec['regions'])
            if crop:
                out, w, h = crop
                rel = out.relative_to(ROOT).as_posix()
                q['passage'] = [{
                    'type': 'svg',
                    'alt': f'{date} 인간공학기사 {no}번 원문 그림·표·수식',
                    'content': f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{rel}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>",
                    'caption': '텍스트 추출로 누락될 수 있는 그림·표·수식을 원문 이미지로 보존했습니다.'
                }]
                stats['visual'] += 1
        q['choices'] = choices
        q['answer'] = answer
        q['explanation'] = clean_explanation(rec['expl'], answer, choices[answer - 1])
        questions.append(q)
    doc.close()

    out_data = {
        'examId': date,
        'title': f'인간공학기사 필기 {y}년 {mo}월 {d}일',
        'duration': 120,
        'passingScore': 60,
        'subjects': SUBJECTS,
        'questions': questions,
    }
    out_path = DATA_DIR / f'인간공학기사 {date}.json'
    out_path.write_text(json.dumps(out_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return out_path, stats


def update_index(entries):
    idx_path = DATA_DIR / 'index.json'
    data = json.loads(idx_path.read_text(encoding='utf-8'))
    # Remove prior ergonomics entries so re-running is idempotent.
    data = [x for x in data if '인간공학기사' not in f"{x.get('id','')} {x.get('title','')}"]
    new = []
    for out_path in entries:
        d = json.loads(out_path.read_text(encoding='utf-8'))
        date = d['examId']
        y, mo, day = map(int, date.split('-'))
        new.append({
            'id': f'인간공학기사 {date}',
            'title': '인간공학기사 필기',
            'date': f'{y}년 {mo}월 {day}일',
            'questions': 80,
            'duration': 120,
            'subjects': [s['name'] for s in SUBJECTS],
        })
    # Placement in index is not UI order (UI groups by category), but keep all human-factor entries together.
    data.extend(sorted(new, key=lambda x: x['date'], reverse=True))
    idx_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    pdfs = sorted(PDF_ROOT.glob('인간공학기사*.pdf'))
    if not pdfs:
        raise SystemExit('인간공학기사 PDF가 없습니다.')
    entries = []
    report = []
    for pdf in pdfs:
        out, stats = import_one(pdf)
        entries.append(out)
        report.append((pdf.name, out.name, stats))
        print(f"OK {pdf.name} -> {out.name} | visual={stats['visual']} repairs={stats['choice_repairs']} markerMismatch={stats['body_answer_mismatch']}")
    update_index(entries)
    print(f'완료: {len(entries)}개 회차')

if __name__ == '__main__':
    main()
