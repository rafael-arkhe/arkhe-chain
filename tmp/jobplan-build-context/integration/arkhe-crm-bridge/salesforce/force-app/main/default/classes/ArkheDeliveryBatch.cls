/** Bounded replay of the durable outbox; run with a scope of 50. */
public without sharing class ArkheDeliveryBatch implements Database.Batchable<SObject> {
    public Database.QueryLocator start(Database.BatchableContext context) {
        return Database.getQueryLocator([SELECT Id FROM Arkhe_Delivery__c
            WHERE Status__c IN ('Pending','Retry') AND Attempts__c < 5
            AND (Next_Attempt__c = null OR Next_Attempt__c <= :System.now())]);
    }
    public void execute(Database.BatchableContext context, List<SObject> scope) {
        Set<Id> ids = new Set<Id>();
        for (SObject row : scope) { ids.add(row.Id); }
        System.enqueueJob(new ArkheDeliveryQueue(ids));
    }
    public void finish(Database.BatchableContext context) {}
}
