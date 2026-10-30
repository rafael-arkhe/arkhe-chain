/** Post-commit outbox delivery. Receiver must deduplicate each event_id. */
public without sharing class ArkheDeliveryQueue implements Queueable, Database.AllowsCallouts {
    private Set<Id> ids;
    public ArkheDeliveryQueue(Set<Id> ids) { this.ids = ids; }
    public void execute(QueueableContext context) {
        List<Arkhe_Delivery__c> rows = [SELECT Id, Attempts__c, Approval__r.Event_Id__c,
            Approval__r.Request_Hash__c, Approval__r.Checkpoint_Hash__c, Approval__r.Consumed_At__c
            FROM Arkhe_Delivery__c WHERE Id IN :ids AND Status__c IN ('Pending','Retry')
            AND Approval__r.Consumed_At__c != null AND Attempts__c < 5
            AND (Next_Attempt__c = null OR Next_Attempt__c <= :System.now()) LIMIT 200];
        if (rows.isEmpty()) { return; }
        List<Object> events = new List<Object>();
        Set<Id> sent = new Set<Id>();
        for (Arkhe_Delivery__c row : rows) {
            sent.add(row.Id);
            events.add(new Map<String,Object>{'event_id'=>row.Approval__r.Event_Id__c,
                'request_hash'=>row.Approval__r.Request_Hash__c,
                'checkpoint_hash'=>row.Approval__r.Checkpoint_Hash__c,
                'consumed_at'=>row.Approval__r.Consumed_At__c});
        }
        Boolean delivered = false;
        String failure = 'transport_failure';
        try {
            HttpRequest request = new HttpRequest();
            request.setEndpoint('callout:Arkhe_Receipt/v1/receipts');
            request.setMethod('POST'); request.setTimeout(20000);
            request.setHeader('Content-Type','application/json');
            request.setBody(JSON.serialize(new Map<String,Object>{'schema'=>1,'events'=>events}));
            HttpResponse response = new Http().send(request);
            // Contract: 204 acknowledges durable acceptance of EVERY event in this batch.
            delivered = response.getStatusCode() == 204;
            failure = 'http_'+response.getStatusCode();
        } catch (CalloutException error) {
            // Do not persist provider body, endpoint credentials or exception text.
            failure = 'transport_failure';
        }
        // Lock AFTER the callout; merge with fresh state to preserve another worker's success.
        List<Arkhe_Delivery__c> updates = new List<Arkhe_Delivery__c>();
        for (Arkhe_Delivery__c row : [SELECT Id,Status__c,Attempts__c FROM Arkhe_Delivery__c
            WHERE Id IN :sent FOR UPDATE]) {
            if (row.Status__c == 'Delivered' || (row.Status__c == 'Dead' && !delivered)) { continue; }
            Integer attempts = row.Attempts__c.intValue()+1;
            row.Attempts__c = attempts;
            row.Status__c = delivered ? 'Delivered' : attempts >= 5 ? 'Dead' : 'Retry';
            row.Last_Error__c = delivered ? null : failure;
            row.Next_Attempt__c = delivered || attempts >= 5 ? null : System.now().addMinutes(attempts*attempts);
            updates.add(row);
        }
        update updates;
    }
}
