declare module '*arkhe_pix_wasm.js' {
 export default function init(): Promise<unknown>;
 export function verify_receipt_json(receipt:string,key:string):string;
}

