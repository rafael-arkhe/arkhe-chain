public without sharing class ArkheDeliverySchedule implements Schedulable {
    public void execute(SchedulableContext context) {
        // Concurrent operators can still enqueue duplicates; remote event_id dedup is mandatory.
        if ([SELECT count() FROM AsyncApexJob WHERE ApexClass.Name='ArkheDeliveryBatch'
            AND Status IN ('Holding','Queued','Preparing','Processing')] == 0) {
            Database.executeBatch(new ArkheDeliveryBatch(),50);
        }
    }
}
