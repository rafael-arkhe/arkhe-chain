const path=require('node:path');
const {createDashboardServer}=require('./dashboard-http.cjs');
const config=process.env.ARKHE_KERNEL_CONFIG||path.resolve(__dirname,'../../ops/local/live.json');
const port=Number(process.env.ARKHE_DASHBOARD_PORT||7475);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid dashboard port');
createDashboardServer({kernelConfigPath:config}).listen(port,'127.0.0.1',()=>console.log(`ARKHE dashboard v27: http://localhost:${port} (read-only kernel health, no UI authority)`));
