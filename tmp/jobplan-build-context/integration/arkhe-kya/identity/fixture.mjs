// Throwaway test certificates only. Never export/store the generated private keys.
// Construction follows the upstream MIT-licensed test PKI APIs; see UPSTREAM-NOTICE.md.
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { GeneralName, GeneralNames, OtherName, id_ce_subjectAltName } from '@peculiar/asn1-x509';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

const algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',publicExponent:new Uint8Array([1,0,1]),modulusLength:2048};
const b64=buffer=>Buffer.from(buffer).toString('base64');
export const TEST_CNPJ='11222333000181'; // upstream public synthetic test value, unrelated to the pilot candidate

export async function makeFixture(challenge,now) {
  x509.cryptoProvider.set(globalThis.crypto);
  pkijs.setEngine('arkhe-test',new pkijs.CryptoEngine({name:'arkhe-test',crypto:globalThis.crypto}));
  const instant=new Date(now*1000);
  const keys=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
  const ca=await x509.X509CertificateGenerator.createSelfSigned({serialNumber:'01',name:'CN=Arkhe Synthetic Test CA,O=TEST ONLY,C=BR',
    notBefore:new Date(instant.getTime()-86400000),notAfter:new Date(instant.getTime()+86400000),keys,signingAlgorithm:algorithm,
    extensions:[new x509.BasicConstraintsExtension(true,1,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign|x509.KeyUsageFlags.cRLSign,true)]});
  const leafKeys=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
  const otherName=new OtherName({typeId:'2.16.76.1.3.3',value:AsnConvert.serialize(new OctetString(new TextEncoder().encode(TEST_CNPJ)))});
  const san=new x509.Extension(id_ce_subjectAltName,false,AsnConvert.serialize(new GeneralNames([new GeneralName({otherName})])));
  const leaf=await x509.X509CertificateGenerator.create({serialNumber:'02',subject:`CN=SYNTHETIC ONLY:${TEST_CNPJ},O=TEST ONLY,C=BR`,
    issuer:ca.subject,notBefore:new Date(instant.getTime()-3600000),notAfter:new Date(instant.getTime()+3600000),signingAlgorithm:algorithm,
    publicKey:leafKeys.publicKey,signingKey:keys.privateKey,
    extensions:[san,new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature|x509.KeyUsageFlags.nonRepudiation,true)]});
  const leafP=pkijs.Certificate.fromBER(leaf.rawData),caP=pkijs.Certificate.fromBER(ca.rawData);
  const cms=new pkijs.SignedData({version:1,encapContentInfo:new pkijs.EncapsulatedContentInfo({eContentType:'1.2.840.113549.1.7.1'}),
    signerInfos:[new pkijs.SignerInfo({version:1,sid:new pkijs.IssuerAndSerialNumber({issuer:leafP.issuer,serialNumber:leafP.serialNumber})})],
    certificates:[leafP,caP]});
  await cms.sign(leafKeys.privateKey,0,'SHA-256',new TextEncoder().encode(challenge).buffer);
  const content=new pkijs.ContentInfo({contentType:'1.2.840.113549.1.7.2',content:cms.toSchema(true)});
  const crl=async(entries,from=-60000,until=60000)=>{
    const value=await x509.X509CrlGenerator.create({issuer:ca.subject,thisUpdate:new Date(instant.getTime()+from),
      nextUpdate:new Date(instant.getTime()+until),signingAlgorithm:algorithm,signingKey:keys.privateKey,entries});
    return b64(value.rawData);
  };
  return {leaf_certificate:b64(leaf.rawData),cms_base64:b64(content.toSchema().toBER(false)),anchors:[b64(ca.rawData)],
    clean:await crl([]),revoked:await crl([{serialNumber:'02',revocationDate:new Date(instant.getTime()-30000),reason:x509.X509CrlReason.keyCompromise}]),
    expired:await crl([],-120000,-1000),future:await crl([],1000,60000),tooOld:await crl([],-600000,60000)};
}
