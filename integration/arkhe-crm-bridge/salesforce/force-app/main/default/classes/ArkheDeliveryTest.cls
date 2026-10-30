@IsTest
private class ArkheDeliveryTest {
    @TestSetup static void permissions() {
        insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),
            PermissionSetId=[SELECT Id FROM PermissionSet WHERE Name='Arkhe_Bridge_Issuer'].Id);
    }
    private class ReceiptMock implements HttpCalloutMock {
        private Integer code;
        private Boolean timeout;
        ReceiptMock(Integer code, Boolean timeout) { this.code=code; this.timeout=timeout; }
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('callout:Arkhe_Receipt/v1/receipts',request.getEndpoint());
            System.assertEquals('POST',request.getMethod());
            Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(request.getBody());
            System.assertEquals(1,body.get('schema'));
            System.assertEquals(1,((List<Object>)body.get('events')).size());
            if (timeout) { throw new CalloutException('synthetic timeout'); }
            HttpResponse response=new HttpResponse(); response.setStatusCode(code); return response;
        }
    }
    // Records use the same trusted issuance path as the production gate.
    private static Arkhe_Delivery__c fixture() {
        Lead lead=new Lead(LastName='Delivery',Company='Sandbox'); insert lead;
        lead=[SELECT Id,SystemModstamp FROM Lead WHERE Id=:lead.Id];
        // Refresh permission evaluation for the current test principal.
        System.runAs(new User(Id=UserInfo.getUserId())) {
            insert new Arkhe_Write_Approval__c(Event_Id__c='delivery-fixture', Org_Id__c=UserInfo.getOrganizationId(),
                Target_Lead__c=lead.Id,Field_API_Name__c='LeadSource',New_Value__c='Web',
                Expected_Version__c=lead.SystemModstamp,Expires_At__c=System.now().addMinutes(4),
                Request_Hash__c='a'.repeat(64),Checkpoint_Hash__c='b'.repeat(64),Producer_Id__c='fixture');
            lead.LeadSource='Web'; update lead;
        }
        return [SELECT Id,Status__c,Attempts__c,Next_Attempt__c,Last_Error__c FROM Arkhe_Delivery__c LIMIT 1];
    }
    @IsTest static void flowCreatesOutboxAfterConsumptionAndQueueAcknowledges() {
        Arkhe_Delivery__c row=fixture();
        System.assertEquals('Pending',row.Status__c);
        Test.setMock(HttpCalloutMock.class,new ReceiptMock(204,false));
        Test.startTest(); System.enqueueJob(new ArkheDeliveryQueue(new Set<Id>{row.Id})); Test.stopTest();
        row=[SELECT Status__c,Attempts__c FROM Arkhe_Delivery__c WHERE Id=:row.Id];
        System.assertEquals('Delivered',row.Status__c); System.assertEquals(1,row.Attempts__c);
    }
    @IsTest static void failureRetriesAndStopsAtFive() {
        Arkhe_Delivery__c row=fixture(); row.Attempts__c=4; update row;
        Test.setMock(HttpCalloutMock.class,new ReceiptMock(503,false));
        Test.startTest(); System.enqueueJob(new ArkheDeliveryQueue(new Set<Id>{row.Id})); Test.stopTest();
        row=[SELECT Status__c,Attempts__c,Last_Error__c FROM Arkhe_Delivery__c WHERE Id=:row.Id];
        System.assertEquals('Dead',row.Status__c); System.assertEquals(5,row.Attempts__c);
        System.assertEquals('http_503',row.Last_Error__c);
    }
    @IsTest static void timeoutRetainsRetryWithoutLeakingError() {
        Arkhe_Delivery__c row=fixture();
        Test.setMock(HttpCalloutMock.class,new ReceiptMock(204,true));
        Test.startTest(); System.enqueueJob(new ArkheDeliveryQueue(new Set<Id>{row.Id})); Test.stopTest();
        row=[SELECT Status__c,Next_Attempt__c,Last_Error__c FROM Arkhe_Delivery__c WHERE Id=:row.Id];
        System.assertEquals('Retry',row.Status__c); System.assert(row.Next_Attempt__c>System.now());
        System.assertEquals('transport_failure',row.Last_Error__c);
    }
    @IsTest static void batchSelectsOnlyDueRows() {
        Arkhe_Delivery__c row=fixture(); row.Status__c='Delivered'; update row;
        Test.startTest(); Id job=Database.executeBatch(new ArkheDeliveryBatch(),50); Test.stopTest();
        System.assertEquals(0,[SELECT NumberOfErrors FROM AsyncApexJob WHERE Id=:job].NumberOfErrors);
        System.assertEquals('Delivered',[SELECT Status__c FROM Arkhe_Delivery__c WHERE Id=:row.Id].Status__c);
    }
    @IsTest static void batchDispatchesPendingAndSchedulerStartsBatch() {
        Arkhe_Delivery__c row=fixture();
        Test.setMock(HttpCalloutMock.class,new ReceiptMock(204,false));
        Test.startTest(); new ArkheDeliverySchedule().execute(null); Test.stopTest();
        System.assertEquals(1,[SELECT count() FROM AsyncApexJob WHERE ApexClass.Name='ArkheDeliveryBatch' AND JobType='BatchApex']);
        // Nested Queueable execution is covered independently, not inferred from Test.stopTest.
    }
    @IsTest static void schedulerCanBeRegistered() {
        Test.startTest(); Id job=System.schedule('Arkhe Delivery Test','0 0 0 1 1 ? 2099',new ArkheDeliverySchedule());
        System.assertEquals('0 0 0 1 1 ? 2099',[SELECT CronExpression FROM CronTrigger WHERE Id=:job].CronExpression);
        System.abortJob(job); Test.stopTest();
    }
}
