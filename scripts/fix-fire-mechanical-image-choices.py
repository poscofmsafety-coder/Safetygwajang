#!/usr/bin/env python3
from pathlib import Path
import fitz,json
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
AS=ROOT/'assets/cbt/fire-mechanical'
try: FONT=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',30)
except: FONT=ImageFont.load_default()
LAB={1:'①',2:'②',3:'③',4:'④'}

def crop_blocks(pdf,page_index,bboxes,labels,out):
    doc=fitz.open(pdf); page=doc[page_index]; pieces=[]
    for box,lab in zip(bboxes,labels):
        r=fitz.Rect(box); r=fitz.Rect(max(0,r.x0-2),max(0,r.y0-2),min(page.rect.width,r.x1+2),min(page.rect.height,r.y1+2))
        pix=page.get_pixmap(matrix=fitz.Matrix(2.1,2.1),clip=r,alpha=False)
        im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples); pieces.append((im,lab))
    doc.close(); gap=14; lw=58; maxw=max(im.width+(lw if lab else 0) for im,lab in pieces); h=sum(im.height for im,_ in pieces)+gap*(len(pieces)-1)
    can=Image.new('RGB',(maxw,h),'white'); y=0; dr=ImageDraw.Draw(can)
    for im,lab in pieces:
        x=lw if lab else (maxw-im.width)//2
        if lab: dr.text((5,y+max(0,(im.height-34)//2)),LAB[lab],font=FONT,fill='black')
        can.paste(im,(x,y)); y+=im.height+gap
    out.parent.mkdir(parents=True,exist_ok=True); can.save(out,'PNG',optimize=True); return can.width,can.height

def patch_json(date,no,choices,w,h):
    p=ROOT/'data'/f'소방설비기사(기계분야) {date}.json'; d=json.loads(p.read_text(encoding='utf-8')); q=d['questions'][no-1]
    q['choices']=choices
    rel=(AS/date/f'q{no:02d}.png').relative_to(ROOT).as_posix()
    q['passage']=[{'type':'svg','alt':f'{no}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{rel}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# 2020-06-06 Q36: four formula choices are image-only, in top-to-bottom order 1..4.
pdf='/mnt/data/소방설비기사(기계분야)20200606(교사용).pdf'; out=AS/'2020-06-06/q36.png'
b=[(54.21099853515625,454.3039855957031,255.7030029296875,498.6549987792969),(54.21099853515625,504.4079895019531,289.8840026855469,546.3619995117188),(22.667999267578125,562.9039916992188,258.94097900390625,606.656005859375),(22.667999267578125,623.3179931640625,277.531005859375,665.990966796875)]
w,h=crop_blocks(pdf,2,b,[1,2,3,4],out); patch_json('2020-06-06',36,['위 그림 ①','위 그림 ②','위 그림 ③','위 그림 ④'],w,h)

# 2021-05-15 Q24: main diagram + image choices 1,2,3; choice 4 is text in PDF.
pdf='/mnt/data/소방설비기사(기계분야)20210515(교사용).pdf'; out=AS/'2021-05-15/q24.png'
b=[(40.77799987792969,253.2830047607422,260.260009765625,387.5360107421875),(54.21099853515625,394.8480224609375,127.97100067138672,428.4110107421875),(156.156005859375,393.2900085449219,222.12100219726562,428.6510009765625),(54.21099853515625,434.5240173339844,121.9749984741211,466.8890075683594)]
w,h=crop_blocks(pdf,1,b,[None,1,2,3],out); patch_json('2021-05-15',24,['위 그림 ①','위 그림 ②','위 그림 ③','3ρπV²D²'],w,h)
print('fixed fire mechanical q36/q24 image choices')
