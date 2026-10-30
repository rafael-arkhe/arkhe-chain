import json,urllib.request,datetime
from pathlib import Path

ENDPOINT='https://starknet-rpc.publicnode.com'
ALLOWED={'starknet_chainId','starknet_specVersion','starknet_blockHashAndNumber','starknet_getClassHashAt','starknet_call'}
rows=[]
def rpc(method,params):
    assert method in ALLOWED
    request={'jsonrpc':'2.0','id':len(rows)+1,'method':method,'params':params}
    row={'request':request}
    try:
        req=urllib.request.Request(ENDPOINT,data=json.dumps(request).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=20) as response:
            raw=response.read(262145)
            assert len(raw)<=262144
            data=json.loads(raw)
        row['response']=data
        rows.append(row)
        if 'error' in data: return None
        return data['result']
    except Exception as e:
        row['transport_error']=type(e).__name__
        if hasattr(e,'code'):row['http_status']=e.code
        rows.append(row);return None

chain=rpc('starknet_chainId',[])
if chain!='0x534e5f4d41494e':
    out=Path('docs/evidence/local/2026-10-18/starknet-expanded-tests')
    result={'status':'BLOCKED_BEFORE_CHAIN_IDENTITY','endpoint':ENDPOINT,'requests':rows,'mutations':False,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    i=1
    while (out/f'production-read-blocked-{i:02}.json').exists():i+=1
    (out/f'production-read-blocked-{i:02}.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))
    raise SystemExit(1)
spec=rpc('starknet_specVersion',[])
head=rpc('starknet_blockHashAndNumber',[])
assert head and head.get('block_hash')
block={'block_hash':head['block_hash']}
addresses={
 'staking':'0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7',
 'reward_supplier':'0x009035556d1ee136e7722ae4e78f92828553a45eed3bc9b2aba90788ec2ca112',
 'minting_curve':'0x00ca1705e74233131dbcdee7f1b8d2926bf262168c7df339004b3f46015b6984',
 'starkgate_bridge':'0x0616757a151c21f9be8775098d591c2807316d992bbc3bb1a5c1821630589256',
}
selectors={'identify':'0x039f1a524c3a7a49806d9c206d27143907adb648ee81bd9d294fa9b5ae65c25a','version':'0x021b4dd49a85c82b73f138b112d5135149203ed36c1ec80c46f8c572daa7c5ec','contract_parameters':'0x036735aa694184cd8116c479c296d9431cc04a470e0467c07067e4586f647ece','contract_parameters_v1':'0x01bbe983762bed00ab1fb31234611c56f8561e3cdcc963d7b5eb3875517a7435'}
contracts={}
for name,address in addresses.items():
    record={'address':address,'class_hash':rpc('starknet_getClassHashAt',[block,address]),'calls':{}}
    for method in ['identify','version']:
        value=rpc('starknet_call',[{'contract_address':address,'entry_point_selector':selectors[method],'calldata':[]},block])
        record['calls'][method]=value
        if isinstance(value,list) and len(value)==1:
            try:
                n=int(value[0],16);record['calls'][method+'_short_string']=n.to_bytes((n.bit_length()+7)//8,'big').decode('ascii')
            except (ValueError,UnicodeError):pass
    method='contract_parameters_v1' if name=='reward_supplier' else 'contract_parameters'
    if name in ['reward_supplier','minting_curve']:
        record['calls'][method]=rpc('starknet_call',[{'contract_address':address,'entry_point_selector':selectors[method],'calldata':[]},block])
    contracts[name]=record
result={'classification':'READ_ONLY_PRODUCTION_SNAPSHOT_NOT_EXPLOIT_TEST','checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'endpoint':ENDPOINT,'address_source':'https://docs.starknet.io/learn/cheatsheets/chain-info','chain_id':chain,'rpc_spec_version':spec,'pinned_block':head,'contracts':contracts,'requests':rows,'mutations':False,'limitations':['Provider responses not independently proven or cross-checked','Identity/version strings do not establish source or bytecode equivalence','No actual transaction broadcast, no private keys, no production mutation']}
out=Path('docs/evidence/local/2026-10-18/starknet-expanded-tests')
i=1
while (out/f'production-read-{i:02}.json').exists():i+=1
(out/f'production-read-{i:02}.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'block':head,'contracts':contracts,'request_count':len(rows)}))
