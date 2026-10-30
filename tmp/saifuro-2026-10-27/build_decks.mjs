import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from '@oai/artifact-tool';

const workspaceDir='D:/arkhe/output/saifuro-2026-10-27';
const build='D:/arkhe/tmp/saifuro-2026-10-27';
const SKILL_DIR='C:/Users/Lemes/.codex/plugins/cache/openai-primary-runtime/presentations/26.1025.11240/skills/presentations';
const PY='C:/Users/Lemes/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL_DIR,'container_tools/artifact_tool_utils.mjs')).href);
const C={bg:'#0B0F19',white:'#F2F6FA',muted:'#B5C4D2',cyan:'#00F0FF',green:'#00FF88',border:'#385067'};
const src={about:'https://saifuro.com/about',verify:'https://docs.saifuro.com/reference/verify-a-verdict',limits:'https://docs.saifuro.com/reference/verdict-limits',gaps:'https://docs.saifuro.com/reference/not-built-yet',job:'https://saifuro.com/careers/smart-contract-engineer-evm',legal:'https://saifuro.com/legal'};
function text(s,str,x,y,w,h,size=28,color=C.white,bold=false){
 const sh=s.shapes.add({geometry:'textbox',name:str.slice(0,45),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=str;sh.text.insets=0;sh.text.style={typeface:'Arial',fontSize:size,color,bold};return sh;
}
function node(s,label,x,y,w=270,h=100,color=C.cyan){
 const sh=s.shapes.add({geometry:'rect',name:label,position:{left:x,top:y,width:w,height:h},fill:C.bg,line:{fill:color,width:2}});
 sh.text=label;sh.text.insets=16;sh.text.style={typeface:'Arial',fontSize:24,color:C.white,bold:true};return sh;
}
function flow(s,labels,y=270){
 const gap=42,w=(1136-gap*(labels.length-1))/labels.length;
 labels.forEach((label,i)=>{const x=72+i*(w+gap);node(s,label,x,y,w,118,i===labels.length-1?C.green:C.cyan);if(i<labels.length-1)text(s,'›',x+w+10,y+27,30,45,40,C.muted);});
}
const publicSlides=[
 {title:'Arkhe and Saifuro',sub:'A proposed evaluation of independently verifiable payment evidence',cover:true,foot:'Rafael Oliveira   /   27 October 2026   /   Discussion proposal'},
 {title:'The evaluation question',lead:'Can a retained evidence bundle improve independent review?',body:['Saifuro already describes a decision log.','The pilot compares a proposed bundle with that existing workflow.','The benefit must be demonstrated on a bounded task.'],note:'Product context: '+src.about},
 {title:'Authorization and outcome evidence',diagram:['Authorization\nstatement','Separate payment\noutcome','Verifiable\nevidence bundle'],bottom:'Proposed integration. An authorization alone does not establish settlement.',note:src.limits},
 {title:'A limited pilot',lead:'Synthetic records first',body:['One source profile and one isolated adapter.','Offline verification with approved trust material.','Negative tests, reconciliation and a written evaluation.','No production payment execution or custody authority.'],note:'Proposed scope. See 06_PILOT_PLAN_EN.md.'},
 {title:'Rights and commercial scope',lead:'A specific agreement for specific materials',body:['Respect existing open source permissions.','Identify any private materials and their lawful owner.','Allocate each new deliverable before development.','Price services and any additional license separately.'],note:'Local evidence: D:/arkhe/Cargo.toml and package manifests. License declaration Apache-2.0 OR MIT. Publication history and title review pending.'},
 {title:'A written problem statement',lead:'Proposed next step',body:['Confirm the technical owner and the review problem.','Agree whether the pilot merits a separate conversation.','Keep recruitment and commercial evaluation distinct.'],bottom:'Rafael contributes Web3 research, context engineering and specifications. Qualified engineers own security-critical implementation.',note:'This is a proposal, not an agreed partnership. No message was sent.'},
];
const technicalSlides=[
 {title:'Arkhe and Saifuro',sub:'Technical evaluation proposal for independently verifiable evidence',cover:true,foot:'Restricted discussion draft   /   No production integration asserted'},
 {title:'The existing evidence boundary',lead:'A signed decision is one evidence object',body:['Saifuro documents a log and signed verdicts.','The proposed adapter preserves the original statement.','Execution evidence needs a separate source and explicit attribution.'],note:src.about+'\n'+src.limits},
 {title:'Proposed system boundary',diagram:['Saifuro export\nApproved source','Arkhe adapter\nValidate and record','Auditor bundle\nVerify offline'],bottom:'Customer systems retain payment authority. The adapter receives no wallet keys.',note:'Architecture proposal. No implementation or custody claim is made.'},
 {title:'Authorization and settlement',diagram:['Signed\nauthorization','Attributed\noutcome evidence','Linked records\nwith uncertainty'],bottom:'Unknown, pending, failed and reversed outcomes remain explicit.',note:src.limits+'\nThe integration must not infer payment from allow.'},
 {title:'The signed token boundary',lead:'Preserve exact source bytes',body:['Keep the original token and a namespaced digest.','Use a strict, versioned verification profile.','Separate signature validation from transaction claims.','Store provenance for the trust configuration.'],note:src.verify+'\nAdapter design proposed in 05_TECHNICAL_RFC_EN.md.'},
 {title:'The escrow envelope question',lead:'The public token profile and escrow contract need reconciliation',body:['The public JWT uses ES256.','The public limits page describes no aud claim.','The role describes audience verification onchain.','Request the actual escrow envelope before designing a verifier.'],note:src.verify+'\n'+src.limits+'\n'+src.job+'\nThis is an open question, not a confirmed vulnerability.'},
 {title:'Mapping to WorkerExecutionRecord',lead:'Record the adapter operation',body:['module_id and module_version identify the adapter.','input_digest identifies the input envelope.','output_digest identifies the validation report.','evidence_refs links retained source objects.'],bottom:'A WER does not establish that the underlying purchase executed.',note:'Local source: D:/arkhe/kernel/arkhe-core/src/worker.rs. Additional tenant and payment metadata requires an agreed sidecar schema.'},
 {title:'Offline verification trust',diagram:['Approved key\nand profile','Signed checkpoint\nand disclosed records','Verifier result\nwith stated limits'],bottom:'A bundle cannot reveal current revocations or omitted events without additional evidence.',note:'Local source: D:/arkhe/evidence/arkhe-wormgraph/src/anchor.rs. Proposed trust procedure, not Saifuro interoperability evidence.'},
 {title:'Completeness and policy history',lead:'Inclusion needs source reconciliation',body:['Retain export boundaries and expected record counts.','Detect gaps and conflicting event identities.','Do not reconstruct old rules from policy_version alone.','Collect attributable policy evidence if required.'],note:src.gaps+'\nProposed reconciliation controls in RFC and pilot plan.'},
 {title:'Failure handling',lead:'No successful evidence receipt after a failed write',body:['Duplicates return the existing evidence identity.','Conflicting content enters quarantine.','Missing settlement evidence remains unknown.','Reversals append a linked record.'],note:'Proposed adapter behavior. Payment handling remains outside this evaluation.'},
 {title:'Data and disclosure boundaries',lead:'Minimize retained information',body:['Start with synthetic records and approved environments.','Keep raw tokens and sensitive metadata access controlled.','Review hashes for privacy and dictionary attacks.','Treat public anchoring as a separate design decision.'],note:'Data controls are proposals. No DPA roles or international transfer mechanism have been established.'},
 {title:'Pilot delivery phases',diagram:['Profile and\ntrust model','Adapter and\nnegative tests','Independent\nreview'],bottom:'Proposed four-week planning envelope, subject to access, staffing and signed scope.',note:'See 06_PILOT_PLAN_EN.md and 13_STATEMENT_OF_WORK_EN.md. The duration is an estimate.'},
 {title:'Acceptance evidence',lead:'A reproducible reviewer exercise',body:['Tampered records and untrusted keys reject.','Replays, conflicts and tenant boundaries behave as specified.','Offline verification uses approved retained roots.','Latency and reviewer effort include measurement conditions.'],note:'Proposed mandatory suite T01 to T18 in 06_PILOT_PLAN_EN.md. No tests of this proposed adapter have been run.'},
 {title:'IP and licensing boundary',lead:'Existing permissions remain intact',body:['Core local manifests declare Apache-2.0 OR MIT.','Version and distribution history need reconciliation.','Private material must be enumerated and lawfully controlled.','New deliverables need an explicit owner and license.'],note:'Local sources: D:/arkhe/Cargo.toml; kernel/arkhe-core/Cargo.toml; evidence/arkhe-wormgraph/Cargo.toml; verification/crates/arkhe-verify-wasm/Cargo.toml.'},
 {title:'People and responsibility',lead:'A qualified implementation team',body:['Rafael: research, context engineering and specifications.','Experienced engineer: implementation and technical review.','Saifuro: source access, signing profile and product decisions.','Independent reviewer: acceptance evidence and limits.'],note:'Proposed staffing. The candidate disclosed no production Solidity experience. No team or role allocation has been agreed.'},
 {title:'Pilot decision',lead:'Agreement on scope precedes restricted delivery',body:['Confirm identity and contracting parties.','Reconcile IP and choose the appropriate NDA.','Complete the evaluation agreement and SOW.','Decide whether the measured result supports a commercial phase.'],note:src.legal+'\nWebsite law does not automatically govern a new transaction. Draft legal terms require completion and review.'},
];

for(const [kind,specs] of [['Public',publicSlides],['Technical',technicalSlides]]){
 const p=Presentation.create({slideSize:{width:1280,height:720}});
 const render=path.join(build,'slides_'+kind);await fs.mkdir(render,{recursive:true});
 for(let i=0;i<specs.length;i++){
  const o=specs[i],s=p.slides.add();s.background.fill=C.bg;
  text(s,kind==='Public'?'PARTNERSHIP EVALUATION':'TECHNICAL EVALUATION',72,40,1000,24,17,C.cyan,true);
  text(s,o.title,72,o.cover?170:103,1136,o.cover?95:104,o.cover?64:44,C.white,true);
  if(o.cover){text(s,o.sub,72,300,980,170,36,C.muted);text(s,'PROPOSAL',72,535,900,35,22,C.green,true);text(s,o.foot,72,590,1136,50,20,C.muted);}
  else if(o.diagram){flow(s,o.diagram);text(s,o.bottom,72,460,1110,100,27,C.muted);}
  else{
   if(o.lead)text(s,o.lead,72,225,1120,88,30,C.green,true);
   const start=330,step=65;
   (o.body??[]).forEach((b,j)=>text(s,b,72,start+step*j,1100,60,27,C.white));
   if(o.bottom)text(s,o.bottom,72,605,1110,55,20,C.muted);
  }
  text(s,'Arkhe / Saifuro   ·   Proposed evaluation   ·   27 Oct 2026',72,677,1050,22,15,C.muted);
  text(s,String(i+1).padStart(2,'0'),1160,674,55,30,19,C.cyan,true);
  s.speakerNotes.text=(o.note??'Discussion proposal. No partnership or production capability is implied.')+'\nDesign uses the palette requested in the supplied conversation. Official brand matching has not been verified.';
 }
 const staging=path.join(workspaceDir,'.validation');await fs.mkdir(staging,{recursive:true});
 const candidatePath=path.join(staging,kind+'_candidate.pptx');
 await (await PresentationFile.exportPptx(p)).save(candidatePath);
 console.log(kind+' exported draft');
 const finalPath=path.join(workspaceDir,'apresentacoes',`Arkhe_Saifuro_${kind}_EN.pptx`);
 const result=await finalizePresentation({workspaceDir,candidatePath,finalPath,pythonExecutable:PY,
 integrityValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
 requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,
 receiptPath:path.join(staging,kind+'.validation.json')});
 console.log(JSON.stringify({kind,result}));
 for(let i=0;i<p.slides.items.length;i++){
  const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(render,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
 }
 await fs.writeFile(path.join(build,kind+'_content.json'),JSON.stringify(specs,null,2));
 console.log(kind+' render complete '+p.slides.items.length);
}

