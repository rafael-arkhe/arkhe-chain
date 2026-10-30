"""Generate environment-specific modern Named Credential metadata; never token material."""
import argparse
from pathlib import Path
import re
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--endpoint",required=True,help="HTTPS receipt service base URL, no path/query/userinfo")
    parser.add_argument("--external-credential",required=True,help="Existing OAuth 2.0 External Credential API name")
    parser.add_argument("--output",type=Path,default=Path("environment-config/main/default/namedCredentials/Arkhe_Receipt.namedCredential-meta.xml"))
    args=parser.parse_args()
    url=urlparse(args.endpoint)
    if url.scheme!="https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in {"","/"}:
        raise SystemExit("An HTTPS base URL without credentials, path, query or fragment is required")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*",args.external_credential):
        raise SystemExit("Invalid External Credential API name")
    ns="http://soap.sforce.com/2006/04/metadata"
    ET.register_namespace("",ns)
    root=ET.Element("{"+ns+"}NamedCredential")
    def add(parent,name,text):
        child=ET.SubElement(parent,"{"+ns+"}"+name)
        child.text=text
        return child
    add(root,"label","Arkhe Receipt")
    add(root,"namedCredentialType","SecuredEndpoint")
    endpoint=add(root,"namedCredentialParameters",None)
    add(endpoint,"parameterName","DefaultEndpoint")
    add(endpoint,"parameterType","Url")
    add(endpoint,"parameterValue",args.endpoint.rstrip("/"))
    auth=add(root,"namedCredentialParameters",None)
    add(auth,"externalCredential",args.external_credential)
    add(auth,"parameterName","DefaultAuth")
    add(auth,"parameterType","Authentication")
    ET.indent(root,space="    ")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    if args.output.exists():
        raise SystemExit("Output exists; review it rather than overwrite environment configuration")
    ET.ElementTree(root).write(args.output,encoding="utf-8",xml_declaration=True)
    print("Named Credential metadata generated; External Credential, principal access and live authentication still require configuration")


if __name__=="__main__": main()
