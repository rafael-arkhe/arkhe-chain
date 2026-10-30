let token;
export const labBusy=()=>Boolean(token);
export function claimLab() {
  if(token)throw Object.assign(Error('A bancada já está executando uma geração ou avaliação.'),{status:409});
  const mine=Symbol();token=mine;return ()=>{if(token===mine)token=undefined;};
}
