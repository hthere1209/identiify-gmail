from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'Computer_Access_and_AI_Work_Agreement.pdf'
pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFontFamily('DejaVu', normal='DejaVu', bold='DejaVu-Bold')
NAVY = HexColor('#182D43')
MUTED = HexColor('#586575')
styles = {
 'title': ParagraphStyle('title', fontName='DejaVu-Bold', fontSize=21, leading=26, textColor=NAVY, spaceAfter=13),
 'sub': ParagraphStyle('sub', fontName='DejaVu', fontSize=10, leading=14, textColor=MUTED, spaceAfter=12),
 'h': ParagraphStyle('h', fontName='DejaVu-Bold', fontSize=11, leading=15, textColor=NAVY, spaceBefore=8, spaceAfter=4),
 'p': ParagraphStyle('p', fontName='DejaVu', fontSize=9, leading=12, spaceAfter=5),
 'small': ParagraphStyle('small', fontName='DejaVu', fontSize=8, leading=11, spaceAfter=5),
}
story=[]
def p(text, style='p'): story.append(Paragraph(text,styles[style]))
def h(text): p(text,'h')
def page(title): story.append(PageBreak()); p(title,'title')
def table(rows, widths):
    data=[[Paragraph(str(c),styles['small']) for c in row] for row in rows]
    t=Table(data,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),HexColor('#EAF0F5')),('GRID',(0,0),(-1,-1),.4,HexColor('#C7D0DA')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
    story.append(t)

p('COMPUTER ACCESS &amp;<br/>AI WORK AGREEMENT','title')
p('Remote computer use • Platform authorization • Revenue sharing','sub')
p('<b>Completion required:</b> Complete all blanks and Schedule A before signing. This is a general contract template, not jurisdiction-specific legal advice; have local counsel review its enforceability and the proposed account arrangement. No platform work may begin until Section 2 is satisfied.','small')
h('1. Parties, purpose and term')
p('Effective date: ____________________. This Agreement is between:<br/><b>Owner legal name:</b> __________________________________________________<br/>Address / country: _____________________________________________________<br/>Notice email: __________________________________________________________<br/><b>Operator legal name:</b> _________________________________________________<br/>Address / country: _____________________________________________________<br/>Notice email: __________________________________________________________')
p('The Owner will provide remote access to the computer identified in Schedule A and described in the referenced Craigslist listing. The Operator will perform authorized AI training tasks using that computer. This Agreement continues from the effective date until terminated under Section 9. Neither party guarantees task availability, minimum hours, approval by a platform, or earnings.')
h('2. Platform accounts and authorization')
p('<b>2.1 Permitted scope.</b> The parties propose to use Snorkel, Handshake, AfterQuery, Mercor, and DataAnnotation. A listed name is not evidence of platform approval. Each platform must be separately cleared in Schedule A; additional platforms require written agreement and the same clearance. Work is limited to AI training, annotation, evaluation, and related tasks expressly permitted by the relevant platform and client.')
p('<b>2.2 Condition before access.</b> Before the Operator accesses a platform or its data, the parties must obtain and retain written authorization from the platform, and the client where required, expressly permitting the actual Operator to perform the work, remote access from the Operator’s actual location, and the proposed account and payment arrangement. They must also review applicable worker agreements and project rules. If permission is absent, unclear, withdrawn, or inconsistent with binding restrictions, affected work must not begin or must stop immediately.')
p('<b>2.3 Identity and accounts.</b> Where expressly authorized, the Owner will create a dedicated work email and platform account using the Owner’s accurate information and personally complete required identity verification. The Operator must be disclosed as the actual worker and use a separate authorized user login or another access method expressly approved by the platform. Neither party may share credentials contrary to platform rules, impersonate the other, complete personal assessments for the other, falsify qualifications or location, or bypass verification, eligibility, security, or geographic restrictions.')
p('<b>2.4 Limits.</b> This Agreement grants no rights against a platform and overrides no platform or client terms. The Owner retains control of account recovery and payout settings. The Operator may not change identity, recovery, banking, or payout information or accept new contractual obligations for the Owner without specific written authority and any required platform consent.')

page('Access, privacy & responsibilities')
h('3. Computer access and security')
p('<b>3.1 Access window.</b> Access is limited to the days and hours in Schedule A. Unless the parties select fixed EST there, “Eastern Time” means America/New_York, observing EST (UTC−5) and EDT (UTC−4) seasonally. Access outside the schedule requires prior written consent. No access is authorized while the schedule is incomplete.')
p('<b>3.2 Workspace.</b> The Owner will provide a dedicated operating-system user account or isolated workspace, with personal data and administrator functions restricted. The parties will approve the remote access software in Schedule A, such as AnyDesk or Windows Remote Desktop, and use current security updates, unique credentials, and multifactor authentication where supported. Administrator access, file transfers, clipboard sharing, recording, and unattended access are disabled unless specifically approved and permitted by platform rules.')
p('<b>3.3 Privacy boundaries.</b> The Operator may access only the agreed workspace and data necessary for authorized tasks. The Operator must not open, copy, modify, export, or delete the Owner’s personal files, saved passwords, financial accounts, private messages, browser profiles, or other unrelated data. Accidental exposure must be closed immediately and reported without retaining a copy. The Owner must not inspect the Operator’s unrelated personal accounts or files.')
p('<b>3.4 Restricted use.</b> No additional users, subcontractors, malware, unauthorized software, cryptocurrency mining, illegal activity, or unrelated commercial use are permitted. The Operator may not disable security controls or use AI assistants, automation, or external data services for tasks unless expressly allowed by the platform and approved by the Owner. Approved software must be properly licensed.')
p('<b>3.5 Incidents.</b> A party discovering suspected unauthorized access, data exposure, credential compromise, or a platform warning must notify the other promptly and in any event within 24 hours, preserve relevant evidence, and cooperate in containment and required notifications. Either party may immediately suspend affected access where reasonably necessary for security or compliance. The Owner may maintain disclosed connection/security logs; task or screen recording requires prior written agreement and all required consents.')
h('4. Responsibilities and expenses')
p('<b>Owner.</b> Provide the agreed computer, electricity, and reasonably reliable internet during the scheduled access hours; keep the workspace reasonably secure; arrange ordinary hardware maintenance; communicate planned outages where practicable; and provide accurate payment statements. The Owner pays electricity, internet, and ordinary equipment costs. Temporary outages do not create guaranteed compensation, but accrued payment duties remain.')
p('<b>Operator.</b> Perform work carefully, follow applicable platform/client instructions and lawful requirements, maintain accurate task and time records, and promptly report errors, rejections, or operational problems. The Operator pays software, licensing, and platform fees relating to the agreed work, subject to Section 5. Neither party may incur costs on the other’s behalf without prior written approval.')
p('<b>Records.</b> Maintain transaction IDs, task periods, approved amounts, fees, refunds, and payment evidence sufficient to reconcile the arrangement. Exchange a work summary weekly and a payment statement for each payout. Retain accounting records for at least two years, or longer if legally required, while keeping platform/client content only as permitted. On reasonable notice, each party may review relevant redacted records without access to unrelated private data.')

page('Revenue, payments & adjustments')
h('5. Revenue split and payment procedure')
p('<b>5.1 Covered receipts.</b> Only compensation and task-linked bonuses attributable to the Operator’s authorized work under this Agreement are shared. Unrelated Owner earnings, referral awards unrelated to that work, and the Owner’s other funds are excluded. The agreed split is <b>Operator: 60%; Owner: 40%</b>. All calculations use the settlement currency in Schedule A.')
p('<b>5.2 Calculation.</b> “Cleared Receipts” means covered funds actually received by the Owner and available for withdrawal, after platform deductions. The “Allocation Base” is Cleared Receipts plus any software or platform fees deducted at source that are the Operator’s responsibility. The Owner’s share is 40% of the Allocation Base. The Operator’s share is 60% of the Allocation Base, less those fees deducted at source. Fees paid directly by the Operator are not deducted again. No electricity, internet, hardware, or Owner income-tax deduction reduces the Operator’s share. Documented refunds and reversals are adjusted under Section 6 without double counting.')
p('<b>Example:</b> A platform pays $1,000 for covered work and deducts a $50 platform fee, leaving $950 received. The Allocation Base is $1,000: the Owner receives $400 and the Operator receives $550. This places the $50 fee entirely on the Operator. If fees exceed the Operator’s share, any shortfall must be supported by records and settled within 14 calendar days; disputed amounts follow Section 10.','small')
p('<b>5.3 Payout account.</b> Where the platform permits, the Owner will connect an account legally held in the Owner’s name to receive payouts. The Owner alone handles banking credentials and verification. The Operator receives redacted payout evidence, not access to the Owner’s bank. Neither party may reroute covered receipts to avoid the other’s share.')
p('<b>5.4 Deadline.</b> Within <b>five business days</b> after each receipt clears, the Owner will send a statement showing the calculation and pay the Operator by the method in Schedule A. “Business day” means Monday through Friday, excluding banking holidays at the Owner’s bank. The Owner pays outgoing transfer fees; the Operator pays fees charged by the Operator’s receiving bank. Any currency conversion must show the provider’s actual rate and charges, with conversion charges borne by the Operator unless otherwise agreed in writing.')
h('6. Withheld funds, refunds and chargebacks')
p('<b>6.1 Platform holds.</b> Amounts pending, disputed, or withheld by the platform are not payable until released and received, except to the extent a party is responsible for a loss under Section 6.3. The Owner will provide the relevant notice within two business days of learning of a hold and pursue available reasonable review with the Operator’s assistance. The Owner may not withhold unrelated cleared amounts or create an undisclosed reserve.')
p('<b>6.2 Ordinary reversals.</b> If covered compensation is later refunded or charged back without either party’s breach, each party bears the reversal in the 60%/40% ratio. Additional platform fees remain the Operator’s responsibility. Credit any returned fees to the party that bore them. A documented adjustment may be applied to future payments with written notice; any remaining undisputed balance is payable within 14 calendar days after supporting evidence is provided.')
p('<b>6.3 Fault and disputes.</b> A party bears documented losses to the extent caused by that party’s fraud, negligence, intentional misconduct, or breach, including unauthorized account use; responsibility is apportioned where both contributed. No disputed deduction may be imposed solely on an unsupported allegation. Pay all undisputed sums on time and resolve the remainder under Section 10. Neither party is entitled to double recovery.')

page('Ownership, term & legal provisions')
regular_body = styles['p']
styles['p'] = ParagraphStyle('legal', parent=regular_body, fontSize=8.6, leading=11.2)
h('7. Equipment, work product and confidentiality')
p('The computer and the Owner’s pre-existing property remain the Owner’s property. The Operator must not sell, pledge, alter hardware, or assert a lien over the computer. The Operator is responsible for proven damage caused by misuse or breach, excluding ordinary wear and unrelated hardware failure. Each party retains its own pre-existing intellectual property.')
p('Work product, datasets, and platform/client information must be handled and assigned as required by applicable client and platform agreements. Each party will execute reasonably necessary documents to give effect to those requirements, to the extent it holds the relevant rights. Neither party may reuse, publish, sell, or export task content except as expressly permitted. The revenue split does not itself transfer ownership of equipment, accounts, or client data.')
p('Each party must protect the other’s nonpublic information and all confidential platform/client information, use it only for this Agreement, and disclose it only to authorized persons with a need to know and equivalent duties, or as legally required. Public information, information lawfully known independently, and independently developed information are excluded. These duties continue for three years after termination, and longer for trade secrets, personal data, or where binding law or client/platform duties require.')
h('8. Relationship, taxes and responsibility')
p('The parties intend an independent commercial relationship and do not intend to create a partnership, employment relationship, or general agency. Actual legal classification depends on applicable law and the facts; this clause waives no mandatory rights. Neither party may bind the other except as expressly authorized. Each is responsible for its own legally imposed taxes and reporting. The Owner’s receipt of gross payouts may create reporting obligations exceeding the Owner’s retained share; both parties will exchange legally required tax information securely and obtain appropriate advice. Any legally required withholding must be documented and remitted to the proper authority.')
p('Each party is responsible for proven direct loss caused by its breach, negligence, or intentional misconduct, subject to applicable law, causation, and the other party’s reasonable duty to mitigate. Neither guarantees platform solvency or acceptance of work. Nothing excludes liability that cannot lawfully be excluded or limits accrued payment duties.')
h('9. Suspension and termination')
p('Either party may terminate on seven calendar days’ written notice. Either may suspend access or terminate immediately for material privacy/security violations, fraud, unlawful activity, loss of platform authorization, or another material breach not cured within three calendar days after notice where cure is possible. The Owner may promptly disable remote access upon suspension or termination; disabling access does not cancel payment obligations.')
p('The Operator will stop work, return or securely delete information as required, and relinquish access credentials. The Owner will revoke remote access and rotate applicable credentials. Within ten business days after termination, the Owner will provide a reconciliation of received and pending amounts. Cleared and later-received amounts remain payable under Section 5. Required legal/accounting records may be retained securely. Payment, adjustments, confidentiality, ownership, and dispute provisions survive as needed to give them effect.')
h('10. Disputes, notices and general terms')
p('The parties will first attempt good-faith resolution within 15 calendar days of written notice describing a dispute. If unresolved, either may use the courts specified in Schedule A; urgent protective relief and mandatory legal rights remain available. Governing law and court location must be completed before signing. Notices go to the emails in Section 1 and are effective upon acknowledged receipt or the next business day after sending if no delivery failure is reported.')
p('This Agreement and completed Schedule A replace prior discussions on this subject. Amendments require both parties’ written agreement; operational approvals may be by email. Neither may assign this Agreement without the other’s written consent and any required platform approval. An unenforceable provision is severed only to the extent necessary. Failure to enforce a right is not a waiver. Counterparts and electronic signatures may be used to the extent permitted by applicable law.')

styles['p'] = regular_body
page('Schedule A • Setup & signatures')
p('Complete this schedule before signing. Attach platform authorization evidence; each additional clearance must identify the platform, actual worker, permitted location, account method, and payment arrangement.','small')
table([
 ['Item','Agreed details'],
 ['Computer / listing','Make, model, asset ID: ___________________________________<br/>Craigslist URL / listing ID: _________________________________<br/>Computer location: ______________________________________'],
 ['Access schedule','Days: __________________________________________________<br/>Start / end times: ________________________________________<br/>Time basis (select): [  ] Eastern Time (EST/EDT)  [  ] Fixed EST (UTC−5)<br/>Operator’s actual work location: _____________________________'],
 ['Remote access','Software / dedicated user: _________________________________<br/>Approved permissions / exceptions: _________________________<br/>_______________________________________________________'],
 ['Payments','Settlement currency: _____________________________________<br/>Operator payment method / recipient: ________________________<br/>_______________________________________________________<br/>Exchange sensitive payment details separately and securely.'],
 ['Law and courts','Governing law (country and state/province): ___________________<br/>Court location (city, state/province, country): ___________________'],
 ],[112,392])
h('Platform clearance register')
p('Every platform below starts as NOT CLEARED. An evidence reference alone does not replace the permission required by Section 2. Leave unused platforms inactive.','small')
table([
 ['Platform','Account / authorized user','Approval date & evidence reference'],
 ['Snorkel','_____________________','____________________________'],
 ['Handshake','_____________________','____________________________'],
 ['AfterQuery','_____________________','____________________________'],
 ['Mercor','_____________________','____________________________'],
 ['DataAnnotation','_____________________','____________________________'],
 ['Other: __________','_____________________','____________________________'],
 ],[103,172,229])
h('Acceptance')
p('By signing, each party confirms that they have read this Agreement, completed its blanks, understand the platform-authorization condition, and agree to its terms. Signing does not itself authorize platform access.','small')
table([
 ['OWNER','OPERATOR'],
 ['Signature: ___________________________<br/><br/>Printed name: ________________________<br/><br/>Date: _______________________________', 'Signature: ___________________________<br/><br/>Printed name: ________________________<br/><br/>Date: _______________________________'],
 ],[252,252])

class NumberedCanvas(canvas.Canvas):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs); self.saved=[]
    def showPage(self):
        self.saved.append(dict(self.__dict__)); self._startPage()
    def save(self):
        count=len(self.saved)
        for state in self.saved:
            self.__dict__.update(state)
            self.setStrokeColor(HexColor('#CBD4DE')); self.setLineWidth(.5)
            self.line(54,46,558,46)
            self.setFont('DejaVu',7); self.setFillColor(MUTED)
            self.drawString(54,33,'COMPUTER ACCESS & AI WORK AGREEMENT')
            self.drawRightString(558,33,f'{self._pageNumber} / {count}')
            super().showPage()
        super().save()

doc=SimpleDocTemplate(str(OUT),pagesize=(612,792),rightMargin=54,leftMargin=54,topMargin=42,bottomMargin=59,
    title='Computer Access and AI Work Agreement',author='Prepared for Owner and Operator',subject='Remote access, authorized AI training work, and 60/40 revenue sharing')
doc.build(story,canvasmaker=NumberedCanvas)
print(OUT)
