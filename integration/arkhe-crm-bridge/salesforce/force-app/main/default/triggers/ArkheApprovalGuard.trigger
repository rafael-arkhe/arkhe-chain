trigger ArkheApprovalGuard on Arkhe_Write_Approval__c (before insert, before update, before delete) {
    ArkheWriteGate.approvalGuard(Trigger.isDelete ? Trigger.old : Trigger.new,
        Trigger.isInsert ? null : Trigger.oldMap, Trigger.isDelete);
}
