trigger ArkheLeadGate on Lead (before update, after update) {
    ArkheWriteGate.handle(Trigger.new, Trigger.oldMap, Trigger.isAfter);
}
