"""Create a deterministic paperback layout from the complete manuscript's Pandoc AST."""
from pathlib import Path
import collections, hashlib, html, json, math, re, subprocess, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, PageBreak, Table, TableStyle, Preformatted, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader, PdfWriter

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf'; TMP=ROOT/'tmp/pdfs'; OUT.mkdir(exist_ok=True,parents=True); TMP.mkdir(exist_ok=True,parents=True)
BASE=Path(__file__).parent
W,H=432,648
INNER,OUTER,TOP,BOTTOM=63,63,54,54
CW=W-INNER-OUTER
for name,file in [('Body','NotoSerif-Regular.ttf'),('Body-Bold','NotoSerif-Bold.ttf'),('Body-Italic','NotoSerif-Italic.ttf'),('Body-BoldItalic','NotoSerif-BoldItalic.ttf'),('Mono','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Body-Bold',italic='Body-Italic',boldItalic='Body-BoldItalic')
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=10,leading=14,spaceAfter=7,splitLongWords=True),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8,leading=11,spaceAfter=5,splitLongWords=True),
 'table':ParagraphStyle('table',fontName='Body',fontSize=8,leading=11,splitLongWords=True),
 'code':ParagraphStyle('code',fontName='Mono',fontSize=8,leading=10,spaceBefore=5,spaceAfter=7),
 'h1':ParagraphStyle('h1',fontName='Body-Bold',fontSize=20,leading=26,spaceAfter=20,keepWithNext=True),
 'h2':ParagraphStyle('h2',fontName='Body-Bold',fontSize=17,leading=23,spaceAfter=16,keepWithNext=True),
 'h3':ParagraphStyle('h3',fontName='Body-Bold',fontSize=12,leading=17,spaceBefore=12,spaceAfter=7,keepWithNext=True),
 'h4':ParagraphStyle('h4',fontName='Body-Bold',fontSize=10,leading=14,spaceBefore=10,spaceAfter=6,keepWithNext=True),
}
for style in styles.values():style.bulletFontName='Body'
stats=collections.Counter()
def esc(s):return html.escape(s,quote=False)
def plain(xs):
    return re.sub('<[^>]+>','',inline(xs,False))
def inline(xs,markup=True):
    out=[]
    for x in xs:
        t=x['t']; c=x.get('c')
        if t=='Str':out.append(esc(c) if markup else c)
        elif t in ('Space','SoftBreak','LineBreak'):out.append(' ')
        elif t=='Code':out.append(esc(c[1]) if markup else c[1])
        elif t in ('Strong','Emph'):
            v=inline(c,markup); tag='b' if t=='Strong' else 'i';out.append(f'<{tag}>{v}</{tag}>' if markup else v)
        elif t=='Link':
            label=inline(c[1],markup);url=c[2][0]
            out.append(label)
            if url.startswith(('http:','https:')) and url not in plain(c[1]):
                out.append((' <font size="8">('+esc(url)+')</font>') if markup else ' ('+url+')')
        else:raise ValueError('Unsupported inline '+t)
    return ''.join(out)

class PrintCanvas(canvas.Canvas):
    def setFont(self,psfontname,size,leading=None):
        # Table layout may request an unused standard font. Keep every PDF font embedded.
        psfontname={'Helvetica':'Body','Helvetica-Bold':'Body-Bold'}.get(psfontname,psfontname)
        return super().setFont(psfontname,size,leading)

class Book(BaseDocTemplate):
    def afterFlowable(self,f):
        if isinstance(f,Paragraph) and getattr(f,'toc_level',None) is not None:
            self.notify('TOCEntry',(f.toc_level,f.getPlainText(),self.page))

def footer(c,d):
    c.saveState();c.setFillColor(colors.black);c.setFont('Body',8)
    if d.page>1:c.drawCentredString(W/2,31,str(d.page))
    c.restoreState()

def blocks(bs):
    result=[]
    for b in bs:
        t=b['t'];v=b.get('c');stats[t]+=1
        if t in ('Para','Plain'):result.append(Paragraph(inline(v),styles['body']))
        elif t=='Header':
            level,attr,xs=v
            if level<=2:result.append(PageBreak())
            p=Paragraph(inline(xs),styles['h'+str(min(level,4))])
            if level<=2:p.toc_level=level-1
            result.append(p)
        elif t=='CodeBlock':
            # A continuation is a typesetting wrap, not an extra source-code statement.
            lines=[];limit=int(CW/pdfmetrics.stringWidth('M','Mono',8))-1
            for line in v[1].expandtabs(4).splitlines():
                lines.extend(textwrap.wrap(line,width=limit,replace_whitespace=False,drop_whitespace=False,break_long_words=True,break_on_hyphens=False,subsequent_indent='  ') or [''])
            result.append(Preformatted('\n'.join(lines),styles['code']))
        elif t=='Table':
            attrs,caption,spec,head,bodies,foot=v
            rows=head[1]+[r for body in bodies for r in body[2]+body[3]]+foot[1]
            data=[]
            for row in rows:
                cells=[]
                for cell in row[1]:
                    assert cell[2:4]==[1,1], 'Spanned table needs explicit layout'
                    cells.append(Paragraph('<br/>'.join(inline(p['c']) for p in cell[4]),styles['table']))
                data.append(cells)
            widths=[x[1].get('c',1/len(spec)) for x in spec];total=sum(widths)
            table=Table(data,colWidths=[CW*x/total for x in widths],repeatRows=len(head[1]),hAlign='LEFT',splitByRow=1,splitInRow=1)
            table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.7,colors.black),('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#bbbbbb')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eeeeee'))]))
            result.extend([table,Spacer(1,10)])
        elif t in ('BulletList','OrderedList'):
            items=v if t=='BulletList' else v[1]
            for i,item in enumerate(items):
                sub=blocks(item)
                for f in sub:
                    if isinstance(f,Paragraph):
                        f.style=ParagraphStyle('list',parent=f.style,leftIndent=13,firstLineIndent=0)
                if sub and isinstance(sub[0],Paragraph):sub[0].bulletText='-' if t=='BulletList' else str(i+1)+'.'
                result.extend(sub)
        elif t=='BlockQuote':result.extend(blocks(v))
        else:raise ValueError('Unsupported block '+t)
    return result

def clean_pdf(src,dst):
    r=PdfReader(src);w=PdfWriter()
    for p in r.pages:
        if '/Annots' in p:del p['/Annots']
        w.add_page(p)
    if len(w.pages)%2:w.add_blank_page(width=W,height=H)
    w.add_metadata({})
    with open(dst,'wb') as f:w.write(f)

def cover(n,hardcover=False):
    spine=n*.002252*72;bleed=9;cw=2*W+spine+18;ch=H+18
    path=OUT/'arkhe-paperback-cover-6x9-white.pdf'
    vertical_offset=0
    if hardcover:
        # User-reported KDP target. Geometry inferred for the existing 216-page
        # 6x9 white-paper case laminate edition; not an official downloaded template.
        spine=(n*.002252+.189)*72
        cw=14.250*72
        bleed=(cw-2*W-spine)/2
        vertical_offset=(10.417*72-ch)/2
        path=OUT/'arkhe-hardcover-cover-14.250x10.417.pdf'
    c=PrintCanvas(str(path),pagesize=(cw,ch+2*vertical_offset),pageCompression=1,initialFontName='Body')
    c.setFillColor(colors.CMYKColor(1,.7,.25,.8));c.rect(0,0,cw,ch+2*vertical_offset,fill=1,stroke=0)
    c.translate(0,vertical_offset)
    front=bleed+W+spine; center=front+W/2
    c.setFillColor(colors.CMYKColor(0,0,0,0));c.setFont('Body-Bold',48);c.drawCentredString(center,560,'ARKHE')
    c.setFont('Body',21)
    for y,line in [(511,'Evidence and Governance'),(481,'for AI Agents')]:c.drawCentredString(center,y,line)
    c.setFont('Body',11);c.drawCentredString(center,445,'An Implementation Handbook')
    c.setFont('Body',16);c.drawCentredString(center,65,'Rafael Oliveira')
    # Original vector geometry keeps print text and artwork resolution independent.
    c.setStrokeColor(colors.CMYKColor(.7,0,.2,0));c.setLineWidth(.7)
    for i in range(8):
        x=front+55+i*19;y=125+i*12;ww=322-i*38;hh=250-i*23
        c.roundRect(x,y,ww,hh,min(ww/2,45),fill=0,stroke=1)
    c.line(center,105,center,399)
    for y in range(120,401,31):c.circle(center,y,2,fill=0,stroke=1)
    x=bleed+38; y=ch-83
    c.setFillColor(colors.CMYKColor(0,0,0,0));c.setFont('Body-Bold',21)
    c.drawString(x,y,'From agent output');c.drawString(x,y-29,'to accountable action.')
    text='A practical guide to evidence, authorization, and failure boundaries in AI agent systems. Learn to connect intentions, policies, checked outputs, and external effects through explicit contracts and reproducible laboratories.'
    cs=ParagraphStyle('cover',fontName='Body',fontSize=12,leading=18,textColor=colors.CMYKColor(0,0,0,0))
    p=Paragraph(text,cs);_,ph=p.wrap(W-76,300);p.drawOn(c,x,y-65-ph)
    p=Paragraph('Canonical identities. Verifiable inclusion. Durable operation journals. Policy lifecycles. Worked engineering cases and exercises.',cs);_,ph=p.wrap(W-76,200);p.drawOn(c,x,260-ph)
    c.setFont('Body',11);c.drawString(x,157,'Rafael Oliveira')
    # Empty barcode box, no invented ISBN. KDP supplies barcode.
    c.setFillColor(colors.CMYKColor(0,0,0,0));c.rect(bleed+W-(56 if hardcover else 36)-144,36,144,86.4,fill=1,stroke=0)
    c.saveState();c.translate(bleed+W+spine/2,ch/2);c.rotate(90)
    c.setFillColor(colors.CMYKColor(0,0,0,0));c.setFont('Body-Bold',10);c.drawCentredString(0,-3,'ARKHE  |  Rafael Oliveira');c.restoreState()
    c.showPage();c.save();clean_pdf_cover=path.with_suffix('.clean.pdf')
    # Cover is exactly one spread; do not apply the even-page interior function.
    r=PdfReader(path);w=PdfWriter();w.add_page(r.pages[0]);w.add_metadata({})
    with open(clean_pdf_cover,'wb') as f:w.write(f)
    clean_pdf_cover.replace(path)
    return path,spine/72,cw/72,(ch+2*vertical_offset)/72

def main():
    ast=TMP/'arkhe-print-ast.json'
    subprocess.run(['pandoc',str(BASE/'manuscrito/arkhe-complete.en.md'),'-t','json','-o',str(ast)],check=True)
    j=json.loads(ast.read_text(encoding='utf-8'))
    raw=TMP/'arkhe-paperback-layout.pdf'
    doc=Book(str(raw),pagesize=(W,H),leftMargin=INNER,rightMargin=OUTER,topMargin=TOP,bottomMargin=BOTTOM,pageCompression=1)
    doc.addPageTemplates([PageTemplate('all',[Frame(INNER,BOTTOM,CW,H-TOP-BOTTOM,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=footer)])
    story=[Spacer(1,90),Paragraph('ARKHE',styles['h1']),Paragraph('Evidence and Governance<br/>for AI Agents',styles['h2']),Spacer(1,25),Paragraph('An Implementation Handbook',styles['body']),Spacer(1,45),Paragraph('Rafael Oliveira',styles['h3']),PageBreak(),Paragraph('Reading the print edition',styles['h2']),Paragraph('This edition uses the complete English manuscript. Long code lines may wrap for typesetting; consult the companion source files for executable code. Source addresses are printed for use away from a screen. The teaching laboratory remains distinct from the native implementation.',styles['body']),PageBreak(),Paragraph('Contents',styles['h1'])]
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc0',fontName='Body-Bold',fontSize=10,leading=14,spaceBefore=8),ParagraphStyle('toc1',fontName='Body',fontSize=9,leading=13,leftIndent=12,spaceBefore=4)]
    story.append(toc);story.extend(blocks(j['blocks']));doc.multiBuild(story,canvasmaker=lambda *a,**kw: PrintCanvas(*a,**dict(kw,initialFontName="Body")))
    interior=OUT/'arkhe-paperback-interior-6x9.pdf';clean_pdf(raw,interior)
    n=len(PdfReader(interior).pages);assert n<=500, 'Recalculate inside margin for larger book'
    cp,spine,cw,ch=cover(n)
    report={'settings':{'binding':'paperback','trim_inches':[6,9],'ink':'black and white','paper':'white','interior_bleed':False,'interior_pages':n,'inside_margin_inches':INNER/72,'outside_margin_inches':OUTER/72,'top_bottom_margin_inches':TOP/72,'cover_bleed_inches':.125,'spine_inches':spine,'cover_inches':[cw,ch]},'source_blocks_converted':dict(stats),'source_sha256':hashlib.sha256((BASE/'manuscrito/arkhe-complete.en.md').read_bytes()).hexdigest(),'artifacts':{p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in [interior,cp]},'kdp_upload_validation':'NOT RUN; requires matching KDP settings and new preview'}
    (BASE/'evidence/print-build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
