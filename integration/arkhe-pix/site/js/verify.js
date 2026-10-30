import init,{verify_receipt_json} from '../wasm/arkhe_pix_wasm.js';
const result=document.getElementById('result'),out=document.getElementById('outcome'),button=document.getElementById('verify');
try {
 await init();button.disabled=false;result.textContent='Cole um recibo sintético e a chave pública confiável.';
 button.addEventListener('click',()=>{
  try {
   const input=document.getElementById('receipt').value;
   if(new TextEncoder().encode(input).length>32768)throw new Error('Recibo excede 32 KiB');
   const outcome=JSON.parse(verify_receipt_json(input,document.getElementById('key').value.trim()));
   result.textContent=outcome.verdict==='signature_valid_synthetic'
    ?'Assinatura válida · synthetic-poc. Liquidação e autorização KYA não verificadas.' : 'Não verificável.';
   out.textContent=JSON.stringify(outcome,null,2);
  } catch {result.textContent='Não verificável.';out.textContent='Entrada inválida.';}
 });
} catch {result.textContent='Não verificável: motor WASM indisponível.';out.textContent='';}
