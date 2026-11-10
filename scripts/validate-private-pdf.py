"""Read-only QA of generated S-13-S. Inputs and outputs must stay private."""
import sys, json, collections, pathlib
import fitz
import numpy as np
from PIL import Image

template_path, reference_path, result_dir = sys.argv[1:4]
out = pathlib.Path(result_dir)
template = fitz.open(template_path)
generated = fitz.open(out / 'S13S-validacion-privada.pdf')
reference = fitz.open(reference_path)
placements = json.loads((out / 'expected-placements.json').read_text())
assert len(generated) == len(reference) == 6
results = []
for index, page in enumerate(generated):
    actual = [s for b in page.get_text('dict')['blocks'] if 'lines' in b
              for line in b['lines'] for s in line['spans']
              if s['font'] == 'Helvetica' and s['text'].strip()]
    expected = [p for p in placements if p['page'] == index]
    assert collections.Counter(s['text'] for s in actual) == collections.Counter(p['text'] for p in expected)
    assert collections.Counter(w[4] for w in page.get_text('words')) == collections.Counter(w[4] for w in reference[index].get_text('words'))
    for item in expected:
        matches = [s for s in actual if s['text'] == item['text'] and abs(s['bbox'][0] - item['x']) < .1]
        assert matches, (index, item['kind'])
        chosen = min(matches, key=lambda s: abs(s['bbox'][1] - item['top']))
        assert abs(chosen['bbox'][2] - (item['x'] + item['width'])) < .12, (index, item['kind'], 'width')
        if item['kind'] != 'period':
            assert chosen['bbox'][0] >= 37 and chosen['bbox'][2] <= 561
            assert chosen['bbox'][1] >= 146.4 and chosen['bbox'][3] <= 771.1
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    original_pix = template[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    b = np.frombuffer(original_pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    mask = np.zeros((pix.height, pix.width), dtype=bool)
    for item in expected:
        x0, x1 = int((item['x'] - 1.5) * 2), int((item['x'] + item['width'] + 1.5) * 2) + 1
        y0, y1 = int((item['top'] - 2) * 2), int((item['top'] + item['height'] + 2) * 2) + 1
        mask[max(0, y0):y1, max(0, x0):x1] = True
    mask[190:198, 266:1124] = True  # Original short underline + new measured line.
    changed_outside = int((np.any(a != b, axis=2) & ~mask).sum())
    assert changed_outside == 0, (index, changed_outside)
    page.get_pixmap().save(out / f'pdf-page-{index+1}.png')
    results.append({'page': index+1, 'fields': len(expected), 'matches_approved_words': True, 'changed_pixels_outside_stamps': 0})

contact = Image.new('RGB', (1230, 1160), '#e5e9e4')
for i in range(len(generated)):
    image = Image.open(out / f'pdf-page-{i+1}.png').convert('RGB')
    image.thumbnail((400, 566))
    contact.paste(image, ((i % 3) * 410 + 5, (i // 3) * 580 + 5))
contact.save(out / 'pdf-contact-sheet.png')
report = {'status': 'PASS', 'fields': len(placements), 'pages': results}
(out / 'pdf-qa.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
