export function schedule(sizes, repetitions, seed) {
  if (!Array.isArray(sizes) || sizes.length !== 3 || sizes.join(',') !== '1000,5000,10000'
    || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30
    || !Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('invalid schedule parameters');
  const plan = Array.from({length:repetitions},()=>sizes).flat();
  let state=seed>>>0;
  for (let i=plan.length-1;i>0;i--) {
    state^=state<<13; state^=state>>>17; state^=state<<5; state>>>=0;
    const j=state%(i+1); [plan[i],plan[j]]=[plan[j],plan[i]];
  }
  return plan;
}
