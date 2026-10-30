from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import xml.etree.ElementTree as E
import json, re
from copy import deepcopy
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors

root=Path('tmp/aria-admin');out=Path('output/aria-admin');out.mkdir(parents=True,exist_ok=True)
edits=json.loads((root/'edits.json').read_text())
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
tag=lambda t:'{'+ns['m']+'}'+t
# Preserve original package features: import fails on the template's person metadata.
# Mutate only authorised input cells and invalidate caches for Excel recalculation.
with ZipFile(root/'cost.xlsx') as z:
    wb=E.fromstring(z.read('xl/workbook.xml'))
    rel=E.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    routes={x.attrib['Id']:x.attrib['Target'] for x in rel}
    paths={s.attrib['name']:'xl/'+routes[s.attrib['{'+ns['r']+'}id']].lstrip('/') for s in wb.find(tag('sheets'))}
    paths={k:v.replace('xl/xl/','xl/') for k,v in paths.items()}
    patches={}
    for name,values in edits.items():
        path=paths[name];xml=z.read(path).decode()
        for addr,val in values.items():
            pat=rf'<c\b[^>]*\br="{addr}"[^>]*?(?:/>|>.*?</c>)'
            m=re.search(pat,xml,re.S)
            assert m,addr
            old=E.fromstring(m.group(0))
            assert old.find(tag('f')) is None, 'Attempt to replace formula '+addr
            attrs={k:v for k,v in old.attrib.items() if k!='t'}
            new=E.Element('c',attrs)
            if isinstance(val,str):
                new.set('t','inlineStr');is_=E.SubElement(new,'is');E.SubElement(is_,'t').text=val
            elif val is not None: E.SubElement(new,'v').text=str(val)
            replacement=E.tostring(new,encoding='unicode').replace('ns0:','').replace(':ns0','')
            # New nodes are unqualified and inherit worksheet default namespace.
            xml=xml[:m.start()]+replacement+xml[m.end():]
        patches[path]=xml.encode()
    for path in z.namelist():
        if re.match(r'xl/worksheets/sheet\d+\.xml$',path):
            xml=patches.get(path,z.read(path)).decode()
            def clear_cache(m):
                v=m.group(0)
                return re.sub(r'<v(?:\s[^>]*)?>.*?</v>|<v\s*/>','',v,flags=re.S) if '<f' in v else v
            xml=re.sub(r'<c\b[^>]*>.*?</c>',clear_cache,xml,flags=re.S)
            patches[path]=xml.encode()
    xml=z.read('xl/workbook.xml').decode()
    xml=re.sub(r'<calcPr\b[^>]*/>','<calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>',xml)
    patches['xl/workbook.xml']=xml.encode()
    target=out/'Arkhe-ARIA-Official-Cost-Template-Draft.xlsx'
    with ZipFile(target,'w',ZIP_DEFLATED) as dst:
        for item in z.infolist():dst.writestr(item,patches.get(item.filename,z.read(item.filename)))
with ZipFile(root/'cost.xlsx') as a,ZipFile(target) as b:
    assert a.namelist()==b.namelist()
    for path in a.namelist():
        if path.startswith('xl/worksheets/') and path.endswith('.xml'):
            x=E.fromstring(a.read(path));y=E.fromstring(b.read(path))
            fx=[E.tostring(n,encoding='unicode') for n in x.iter(tag('f'))]
            fy=[E.tostring(n,encoding='unicode') for n in y.iter(tag('f'))]
            assert fx==fy,path
        elif path not in patches:assert a.read(path)==b.read(path),path
print('Official template: all original formula nodes and other package resources preserved. Caches invalidated.')

pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
W,H=595.2756,841.8898;M=43.2;CW=W-2*M
st=ParagraphStyle('body',fontName='Arial',fontSize=12,leading=13.8,spaceAfter=9)
hs=ParagraphStyle('heading',parent=st,fontName='Arial-Bold',fontSize=14,leading=16,spaceAfter=10)
title=ParagraphStyle('title',parent=hs,fontSize=19,leading=21)
pages=[[
('Arkhe: commercialisation hypothesis',title),
('Part I | Scaling Trust, Track 2.2 | Draft for project-lead review',st),
('1. Route from research to deployed technology',hs),
('Our working hypothesis is that teams delegating work to independently operated agents need a reusable way to bind a proposed action to its policy, supporting evidence and recorded outcome. Arkhe would first release a narrowly scoped, inspectable component rather than a hosted service requiring users to trust Arkhe as a central authority.',st),
('The six-month study would publish a Rust verification core, portable verification interface, two agent adapters, a multi-owner evaluation harness and reproducible evidence. The intended first adopters are agent-framework maintainers and engineering teams working on delegated procurement, bounded expenditure or similarly auditable workflows. These are prospective audiences, not confirmed customers.',st),
('New funded software would be released under MIT and Apache 2.0, in line with the programme. Adoption would begin through technical demonstrations and integration work with interested programme teams. CCTI and other portfolio teams are potential comparison or integration counterparts; no relationship is represented as agreed.',st),
('A possible sustainable business is paid integration, maintenance and specialist assurance around freely reusable software. Willingness to pay, procurement cycles and liability remain untested. There are no established revenues, customer commitments or market-size claims in this hypothesis.',st),
('2. Next stage, people and funding',hs),
('If the study meets its security and utility targets, the next stage would harden one externally selected use case: independent deployment, supported interfaces, key and policy operations, recovery testing and ongoing security review. Real payment or physical-action integrations would need separate qualification and user agreements.',st),
('This would require experienced systems/security engineering, an independent reviewer, an adopter willing to evaluate the component, and legal/IP support. We would seek follow-on research or adoption funding and test paid integration pilots. No future award, investment, pilot or programme access is assumed. A UK-benefit plan and named collaborators must be developed before submission.',st)],
[
('3. Funded team and translation leadership',hs),
('Rafael Oliveira is a psychologist and independent researcher and is available full time, as stated by the applicant. He is proposed as research and project lead. Jameson Bednarski is an independent researcher and would participate part time. A 50% allocation is used only as an editable budgeting assumption. His final role and allocation remain to be confirmed.',st),
('The team has not yet confirmed who will lead commercialisation or which funded member has the relevant product, licensing or business-development experience. Rafael should confirm his interest in leading adoption decisions; neither his title nor Jameson\'s title is treated as proof of commercial experience. Technical delivery and independent-review suppliers are budgeted but not appointed.',st),
('4. Team experience and comfort: self-assessment',hs),
('The template requests ratings from 1 to 10 for funded personnel only. The team has not provided these ratings. They are left for an honest project-lead assessment; they are not inferred from the repository or professional titles.',st),
('RATINGS',None),
('Requested support would focus on identifying adopter needs, mapping alternatives, selecting a realistic initial application, understanding service-delivery economics, and clarifying IP and regulatory responsibilities. Project-specific support must be agreed as eligible expenditure; incorporation, branding and general marketing are excluded from the draft budget.',st)],
[
('5. Intellectual property and impact decisions',hs),
('Rafael is proposed as the coordinator of project IP decisions, subject to confirmation of Arkhe\'s legal identity, ownership and authority to sign. Inventorship, authorship and ownership must be established for all pre-existing code and documentation before it is used as background IP. Access to a repository is not evidence of ownership.',st),
('Before work begins, document background IP, third-party dependencies and licences, contributor permissions, subcontractor terms, and the allocation of new rights. Commission a project-specific licence review. New funded deliverables should permit independent reuse under MIT and Apache 2.0; commercial services must not restrict those rights.',st),
('Contributors and suppliers should agree publication, confidentiality, security disclosure, data handling and rights needed for delivery. Use synthetic evaluation data until any real data has an appropriate lawful basis and agreement. No patent strategy, exclusivity commitment or ownership transfer is asserted without applicant confirmation.',st),
('The final funding agreement must be reviewed for the chosen recipient and activity, including commercialisation, non-UK use, reporting and supply obligations. The programme\'s open-source requirements must be reconciled with those terms before acceptance. A service model is a hypothesis, not a commitment that all future commercialisation is unrestricted.',st),
('Items to complete before submission',hs),
('Confirm legal entity and signing authority; name the funded adoption lead; enter all eight self-assessment ratings; confirm biographies, ownership and contributor arrangements; replace supplier allowances with quotations; and develop specific UK commitments. No UK partner is secured in this draft.',st),
('Document basis',hs),
('Prepared against ARIA\'s Commercialisation Hypothesis Template, Part I, version 1 dated 12 March 2024, and the six-month Arkhe proposal draft. This is a working hypothesis for applicant review, not customer evidence or a record of achieved adoption. AI assisted drafting; the project lead must verify and adopt the final answers.',st),
('Part II is reserved by ARIA for award negotiation and is not completed here.',st)]]
c=canvas.Canvas(str(out/'Arkhe-Commercialisation-Hypothesis-Draft.pdf'),pagesize=(W,H));c.setTitle('Arkhe - Commercialisation hypothesis - Part I draft')
for i,blocks in enumerate(pages):
    y=H-45
    for txt,style in blocks:
        if txt=='RATINGS':
            rows=[['Activity','Rating (1-10)']]+[[x,'To confirm'] for x in ['Intellectual property strategy','Market landscape and needs','Competitive landscape','Applications and product definition','Fundraising from private investors','Techno-economic analysis','Supply chain and manufacturing','Social, ethical and regulatory frameworks']]
            t=Table([[Paragraph(v,st) for v in row] for row in rows],colWidths=[CW-115,115])
            t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.5,colors.black),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
            _,h=t.wrap(CW,H);t.drawOn(c,M,y-h);y-=h+12
        else:
            p=Paragraph(txt,style);_,h=p.wrap(CW,H);p.drawOn(c,M,y-h);y-=h+style.spaceAfter
    assert y>55,(i,y)
    c.setFont('Arial',12);c.drawString(M,40,'DRAFT - applicant confirmation required');c.drawRightString(W-M,40,f'{i+1} / 3');c.showPage()
c.save();print('Commercialisation PDF: 3 pages, Arial 12 pt minimum.')

notes='''# Arkhe administrative review - 22 October 2026

## Budget basis
Six-month bottom-up estimate: GBP153,690. Employee base costs GBP34,500; external costs GBP105,300; indirect costs GBP13,890. No profit, output tax or employer on-cost is included. These exclusions require review and do not establish a legal exemption.

Rafael: GBP48,000 annual FTE comparator, 100%, GBP4,000/month. Jameson: GBP42,000 annual FTE comparator, assumed 50%, GBP1,750/month. These are proposed rates, not actual salaries or approved grant costs. Applicant requested research and estimation. Part time is confirmed; 50% is not.

UK National Careers Service comparators: user researcher GBP34,000-68,000/year; research scientist GBP27,000-48,000/year; software developer GBP30,000-75,000/year. These broad UK occupations do not prove local Brazilian compensation or specialist contracting fees. Budget is denominated in GBP directly; no BRL conversion or exchange-rate claim is made.

External allowances (not quotations): Rust/security implementation 120 days x GBP500; evaluation/integration 40 days x GBP450; independent security review 15 days x GBP800; compute GBP800/month; two programme trips GBP3,000 each; accountant report GBP2,500; project-specific IP/licence advice GBP2,000. Suppliers and locations are unconfirmed. Split geographically only after actual arrangements exist.

The resulting estimate is below the indicative GBP200,000 Track 2 project size. Do not pad costs to reach that number. Establish whether the scope/cost is acceptable or substantively redesign the research plan before submission. The six-month plan remains an estimate, not an approved request.

## Official workbook
The source workbook could not be imported because its person metadata caused an import error. Input-only XML edits preserve the original tabs, formula nodes, validations, charts, styles and other package resources. Only cached formula results are invalidated so that Excel can recalculate. No official formula was replaced or repaired. Start date is blank rather than invented. Native Excel recalculation of the official workbook has NOT been verified. The auxiliary planning workbook is calculated and was tested by changing and restoring Jameson's FTE.

The official template's employee classification assumes a valid employment relationship and eligible annual remuneration. If Jameson or Rafael is instead a contractor, reclassify costs and overheads before submitting. Jameson's location remains blank. Arkhe's name is not proof of legal incorporation or ownership.

## Eligible expenditure
Claim actual necessary, value-for-money project costs. Non-UK employer taxes/social contributions can be eligible. No double counting of direct costs and overheads. Capital useful life may require proportional costing. Subcontractors need ARIA approval and due diligence. Travel must be necessary: no business/first-class fares; premium economy can be considered over ten hours. Incorporation, branding/marketing, pre-award commitments and recoverable VAT are excluded absent applicable written agreement. Profit is zero for grants; research-contract profit is capped at 10% if agreed, not automatic.

Evidence discrepancy: the workbook instructions mention supporting evidence above GBP10,000; the live FAQ states above GBP100. Retain evidence for every item and confirm the applicable threshold in negotiation. The draft takes no permission from the higher threshold.

## Agreement selection
Recipient: Arkhe, as requested; legal form/country/registration/signatory not confirmed. If Arkhe provides goods or services to a market and this is applied R&D, the Research Contract is the likely route, subject to ARIA classification. If an independent individual with no enterprise is the recipient, the Individual Grant route may apply. Non-enterprise organisational R&D may use the Standard Grant. Do not select a route solely from the project name.

Review the final agreement for insurance, IP and commercialisation rights, subcontracting, reporting, tax-inclusive cap, audit, termination, indemnities and governing law before signing. This review does not record acceptance. The research template contains insurance requirements and indemnities that need case-specific review.

Payments are normally reimbursed in arrears, typically quarterly, with monthly payments potentially agreed. Working capital is required. No advance, credit-line interest reimbursement, tax exemption or guaranteed award is assumed.

## Sources
- https://aria.org.uk/media/lhcpjxhc/aria-cost-template.xlsx
- https://www.aria.org.uk/wp-content/uploads/2023/12/Eligible-Expenditure.pdf (downloaded document carries ARIA 2026 text)
- https://www.aria.org.uk/media/in4bsgl3/aria-commercialisation-hypothesis-template.pdf
- https://aria.org.uk/funding-opportunities/faqs
- https://aria.org.uk/media/5xqjnd5i/aria-research-agreement.pdf
- https://aria.org.uk/media/a0ndacb3/aria-individual-grant-funding-agreement.pdf
- https://nationalcareers.service.gov.uk/job-profiles/user-researcher
- https://nationalcareers.service.gov.uk/job-profiles/research-scientist
- https://nationalcareers.service.gov.uk/job-profiles/software-developer
'''
(out/'Administrative-review.md').write_text(notes,encoding='utf8')
print('Saved administrative review.')

