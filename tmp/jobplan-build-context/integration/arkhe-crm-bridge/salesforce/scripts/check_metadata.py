"""Offline structural checks; not an assertion of Metadata API validity."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]/"force-app/main/default"
NS="{http://soap.sforce.com/2006/04/metadata}"


def main():
    files=list(ROOT.rglob("*.xml"))
    for path in files:
        root=ET.parse(path).getroot()
        if not root.tag.startswith(NS):
            raise SystemExit(f"Invalid metadata namespace: {path.name}")
    for extension in ("cls","trigger"):
        for source in ROOT.rglob("*."+extension):
            if not source.with_name(source.name+"-meta.xml").is_file():
                raise SystemExit(f"Missing metadata: {source.name}")
    flow=ET.parse(ROOT/"flows/Arkhe_Consumed_Approval_Outbox.flow-meta.xml").getroot()
    assert flow.findtext(NS+"status")=="Active"
    assert flow.findtext(NS+"start/"+NS+"triggerType")=="RecordAfterSave"
    assert flow.findtext(NS+"start/"+NS+"doesRequireRecordChangedToMeetCriteria")=="true"
    assert flow.findtext(NS+"recordCreates/"+NS+"object")=="Arkhe_Delivery__c"
    print(f"Parsed {len(files)} metadata XML files; structural checks passed; org validation still required")


if __name__=="__main__": main()
