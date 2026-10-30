"""Generate the explicit sandbox-only source metadata; no Salesforce access."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "salesforce/force-app/main/default"
NS = "http://soap.sforce.com/2006/04/metadata"
ET.register_namespace("", NS)


def write(path, tag, values):
    if tag == "CustomField":
        values = sorted(values, key=lambda pair: (pair[0] != "fullName", pair[0]))
    root = ET.Element(f"{{{NS}}}{tag}")
    def add(parent, entries):
        for key, value in entries:
            child = ET.SubElement(parent, f"{{{NS}}}{key}")
            if isinstance(value, list):
                add(child, value)
            else:
                child.text = str(value)
    add(root, values)
    ET.indent(root, space="    ")
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(target, encoding="UTF-8", xml_declaration=True)


write("objects/Arkhe_Write_Approval__c/Arkhe_Write_Approval__c.object-meta.xml", "CustomObject", [
    ("deploymentStatus", "Deployed"), ("label", "Arkhe Write Approval"),
    ("nameField", [("displayFormat", "AWA-{000000}"), ("label", "Approval Number"), ("type", "AutoNumber")]),
    ("pluralLabel", "Arkhe Write Approvals"), ("sharingModel", "Private"),
])
fields = {
    "Event_Id__c": [("length", 255), ("required", "true"), ("type", "Text"), ("unique", "true"), ("caseSensitive", "true")],
    "Org_Id__c": [("length", 18), ("required", "true"), ("type", "Text")],
    "Target_Lead__c": [("deleteConstraint", "Restrict"), ("referenceTo", "Lead"), ("relationshipLabel", "Arkhe Approvals"), ("relationshipName", "ArkheApprovals"), ("required", "true"), ("type", "Lookup")],
    "Field_API_Name__c": [("length", 80), ("required", "true"), ("type", "Text")],
    "New_Value__c": [("length", 32768), ("type", "LongTextArea"), ("visibleLines", 3)],
    "Is_Null__c": [("defaultValue", "false"), ("type", "Checkbox")],
    "Expected_Version__c": [("required", "true"), ("type", "DateTime")],
    "Expires_At__c": [("required", "true"), ("type", "DateTime")],
    "Consumed_At__c": [("type", "DateTime")],
    "Checkpoint_Hash__c": [("length", 64), ("required", "true"), ("type", "Text")],
    "Request_Hash__c": [("length", 64), ("required", "true"), ("type", "Text")],
    "Producer_Id__c": [("length", 255), ("required", "true"), ("type", "Text")],
}
for name, values in fields.items():
    write(f"objects/Arkhe_Write_Approval__c/fields/{name}.field-meta.xml", "CustomField", [
        ("fullName", name), ("label", name.removesuffix("__c").replace("_", " ")), *values])
for index in range(1, 5):
    name = f"Arkhe_Test_{index}__c"
    write(f"objects/Lead/fields/{name}.field-meta.xml", "CustomField", [
        ("fullName", name), ("label", f"Arkhe Sandbox Test {index}"), ("length", 255), ("type", "Text")])
write("customPermissions/Arkhe_Issue_Approval.customPermission-meta.xml", "CustomPermission", [
    ("description", "Trust boundary: permits issuance of preverified write approvals. Integration principal only."),
    ("isLicensed", "false"), ("label", "Arkhe Issue Approval")])
perms = [("customPermissions", [("enabled", "true"), ("name", "Arkhe_Issue_Approval")])]
for name in fields:
    # Universally required fields are not permissionable via fieldPermissions.
    if ("required", "true") in fields[name]:
        continue
    if name != "Consumed_At__c":
        perms.append(("fieldPermissions", [("editable", "true"), ("field", f"Arkhe_Write_Approval__c.{name}"), ("readable", "true")]))
    else:
        perms.append(("fieldPermissions", [("editable", "false"), ("field", f"Arkhe_Write_Approval__c.{name}"), ("readable", "true")]))
perms += [("label", "Arkhe Bridge Issuer"), ("objectPermissions", [
    ("allowCreate", "true"), ("allowDelete", "false"), ("allowEdit", "false"), ("allowRead", "true"),
    ("modifyAllRecords", "false"), ("object", "Arkhe_Write_Approval__c"), ("viewAllRecords", "false")])]
write("permissionsets/Arkhe_Bridge_Issuer.permissionset-meta.xml", "PermissionSet", perms)
write("objects/Arkhe_Delivery__c/Arkhe_Delivery__c.object-meta.xml", "CustomObject", [
    ("deploymentStatus", "Deployed"), ("label", "Arkhe Delivery"),
    ("nameField", [("displayFormat", "AD-{000000}"), ("label", "Delivery Number"), ("type", "AutoNumber")]),
    ("pluralLabel", "Arkhe Deliveries"), ("sharingModel", "Private"),
])
delivery_fields = {
    "Approval__c": [("deleteConstraint", "Restrict"), ("referenceTo", "Arkhe_Write_Approval__c"),
        ("relationshipLabel", "Deliveries"), ("relationshipName", "Deliveries"), ("required", "true"), ("type", "Lookup")],
    "Event_Id__c": [("length", 255), ("required", "true"), ("type", "Text"), ("unique", "true"), ("caseSensitive", "true")],
    "Status__c": [("type", "Picklist"), ("valueSet", [("restricted", "true"), ("valueSetDefinition", [
        ("sorted", "false"), *[("value", [("fullName", status), ("default", str(status == "Pending").lower()), ("label", status)])
        for status in ["Pending", "Retry", "Delivered", "Dead"]]])])],
    "Attempts__c": [("defaultValue", "0"), ("precision", 2), ("scale", 0), ("type", "Number")],
    "Next_Attempt__c": [("type", "DateTime")],
    "Last_Error__c": [("length", 80), ("type", "Text")],
}
for name, values in delivery_fields.items():
    write(f"objects/Arkhe_Delivery__c/fields/{name}.field-meta.xml", "CustomField", [
        ("fullName", name), ("label", name.removesuffix("__c").replace("_", " ")), *values])
for name in ["ArkheWriteGate", "ArkheWriteGateTest", "ArkheDeliveryQueue", "ArkheDeliveryBatch", "ArkheDeliverySchedule", "ArkheDeliveryTest"]:
    write(f"classes/{name}.cls-meta.xml", "ApexClass", [("apiVersion", "65.0"), ("status", "Active")])
for name in ["ArkheLeadGate", "ArkheApprovalGuard"]:
    write(f"triggers/{name}.trigger-meta.xml", "ApexTrigger", [("apiVersion", "65.0"), ("status", "Active")])
print("Generated Salesforce source metadata.")
