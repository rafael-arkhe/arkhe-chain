@IsTest
private class ArkheWriteGateTest {
    @TestSetup static void users() {
        Profile p = [SELECT Id FROM Profile WHERE UserType='Standard'
            AND PermissionsModifyAllData=false AND UserLicense.Name='Salesforce' LIMIT 1];
        String suffix = String.valueOf(Crypto.getRandomLong()).replace('-', '');
        List<User> users = new List<User>();
        for (String role : new List<String>{'issuer', 'normal'}) {
            users.add(new User(Alias=role, LastName='ArkheGateTest',
                Email=role+'@arkhe.invalid', Username=role+'.'+suffix+'@arkhe.invalid',
                ProfileId=p.Id, TimeZoneSidKey='America/Sao_Paulo', LocaleSidKey='en_US',
                EmailEncodingKey='UTF-8', LanguageLocaleKey='en_US'));
        }
        insert users;
        insert new PermissionSetAssignment(AssigneeId=users[0].Id,
            PermissionSetId=[SELECT Id FROM PermissionSet WHERE Name='Arkhe_Bridge_Issuer'].Id);
    }
    private static User actor(String alias) {
        return [SELECT Id FROM User WHERE Alias=:alias AND LastName='ArkheGateTest' LIMIT 1];
    }
    private static Lead lead() {
        Lead row = new Lead(LastName='Arkhe', Company='Sandbox'); insert row;
        return [SELECT Id, LeadSource, SystemModstamp FROM Lead WHERE Id=:row.Id];
    }
    private static Arkhe_Write_Approval__c approval(Lead row, String field, String value, String eventId) {
        return new Arkhe_Write_Approval__c(Event_Id__c=eventId,
            Org_Id__c=UserInfo.getOrganizationId(), Target_Lead__c=row.Id, Field_API_Name__c=field,
            New_Value__c=value, Is_Null__c=value==null, Expected_Version__c=row.SystemModstamp,
            Expires_At__c=System.now().addMinutes(4), Checkpoint_Hash__c='a'.repeat(64),
            Request_Hash__c='b'.repeat(64), Producer_Id__c='fixture-producer');
    }
    private static void issue(List<Arkhe_Write_Approval__c> approvals) {
        System.runAs(actor('issuer')) { insert approvals; }
    }
    @IsTest static void validAndReplayAndImmutable() {
        Lead row = lead();
        Arkhe_Write_Approval__c a = approval(row, 'LeadSource', 'Web', 'valid'); issue(new List<Arkhe_Write_Approval__c>{a});
        row.LeadSource='Web'; update row;
        a = [SELECT Id, Consumed_At__c FROM Arkhe_Write_Approval__c WHERE Id=:a.Id];
        System.assertNotEquals(null, a.Consumed_At__c);
        row.LeadSource='Phone Inquiry';
        System.assertEquals(false, Database.update(row, false).isSuccess());
        System.runAs(actor('issuer')) {
            a.Consumed_At__c=null;
            System.assertEquals(false, Database.update(a, false).isSuccess());
            System.assertEquals(false, Database.delete(a, false).isSuccess());
        }
    }
    @IsTest static void unauthorizedEvenInSystemModeAndUserMode() {
        Lead row = lead();
        System.runAs(actor('normal')) {
            Arkhe_Write_Approval__c a = approval(row, 'LeadSource', 'Web', 'forged-system');
            Database.SaveResult result = Database.insert(a, false);
            System.assertEquals(false, result.isSuccess());
            System.assert(result.getErrors()[0].getMessage().contains('issuer permission'));
            Boolean denied=false;
            try { insert as user approval(row, 'LeadSource', 'Web', 'forged-user'); }
            catch (DmlException error) { denied=true; }
            System.assert(denied, 'USER_MODE must enforce CRUD/FLS');
        }
    }
    @IsTest static void partialSuccessAndDownstreamRollback() {
        Lead good=lead(); Lead bad=lead();
        issue(new List<Arkhe_Write_Approval__c>{approval(good,'LeadSource','Web','good'), approval(bad,'LeadSource','Web','bad')});
        ArkheWriteGate.failAfterConsume.add(bad.Id);
        good.LeadSource='Web'; bad.LeadSource='Web';
        Database.SaveResult[] results=Database.update(new List<Lead>{good,bad},false);
        System.assert(results[0].isSuccess()); System.assertEquals(false,results[1].isSuccess());
        Map<String,Arkhe_Write_Approval__c> saved=new Map<String,Arkhe_Write_Approval__c>();
        for(Arkhe_Write_Approval__c a:[SELECT Event_Id__c,Consumed_At__c FROM Arkhe_Write_Approval__c]) { saved.put(a.Event_Id__c,a); }
        System.assertNotEquals(null,saved.get('good').Consumed_At__c);
        System.assertEquals(null,saved.get('bad').Consumed_At__c,'failed write must not consume approval');
        System.assertEquals(null,[SELECT LeadSource FROM Lead WHERE Id=:bad.Id].LeadSource);
        System.assertEquals(1,[SELECT count() FROM Arkhe_Delivery__c WHERE Event_Id__c='good']);
        System.assertEquals(0,[SELECT count() FROM Arkhe_Delivery__c WHERE Event_Id__c='bad'],
            'Downstream rejection must roll back both consumption and after-save Flow outbox');
        ArkheWriteGate.failAfterConsume.clear(); update bad;
        System.assertNotEquals(null,[SELECT Consumed_At__c FROM Arkhe_Write_Approval__c WHERE Event_Id__c='bad'].Consumed_At__c);
    }
    @IsTest static void missingMismatchStaleAndRecovery() {
        Lead row=lead(); row.LeadSource='Web';
        System.assertEquals(false,Database.update(row,false).isSuccess());
        Arkhe_Write_Approval__c wrong=approval(row,'LeadSource','web','case');
        issue(new List<Arkhe_Write_Approval__c>{wrong});
        System.assertEquals(false,Database.update(row,false).isSuccess(),'case must match exactly');
        Arkhe_Write_Approval__c stale=approval(row,'LeadSource','Web','stale'); stale.Expected_Version__c=row.SystemModstamp.addSeconds(-1);
        issue(new List<Arkhe_Write_Approval__c>{stale});
        System.assertEquals(false,Database.update(row,false).isSuccess());
        Arkhe_Write_Approval__c valid=approval(row,'LeadSource','Web','recover'); issue(new List<Arkhe_Write_Approval__c>{valid});
        // Simulates resuming after issuance committed but before the Lead write.
        update row;
        System.assertNotEquals(null,[SELECT Consumed_At__c FROM Arkhe_Write_Approval__c WHERE Id=:valid.Id].Consumed_At__c);
    }
    @IsTest static void rejectsExpiredAndDuplicateIssuance() {
        Lead row=lead(); Arkhe_Write_Approval__c a=approval(row,'LeadSource','Web','duplicate');
        issue(new List<Arkhe_Write_Approval__c>{a});
        System.runAs(actor('issuer')) {
            System.assertEquals(false,Database.insert(approval(row,'LeadSource','Web','duplicate'),false).isSuccess());
            Arkhe_Write_Approval__c expired=approval(row,'LeadSource','Web','expired'); expired.Expires_At__c=System.now().addSeconds(-1);
            System.assertEquals(false,Database.insert(expired,false).isSuccess());
        }
    }
    @IsTest static void bulk200WithFiveFieldsMeasuresLimits() {
        List<Lead> rows=new List<Lead>(); for(Integer i=0;i<200;i++) { rows.add(new Lead(LastName='Bulk'+i,Company='Sandbox')); }
        insert rows; rows=[SELECT Id,SystemModstamp FROM Lead WHERE Id IN :rows];
        List<Arkhe_Write_Approval__c> approvals=new List<Arkhe_Write_Approval__c>();
        for(Lead row:rows) {
            for(String field:new List<String>{'LeadSource','Arkhe_Test_1__c','Arkhe_Test_2__c','Arkhe_Test_3__c','Arkhe_Test_4__c'}) {
                approvals.add(approval(row,field,'Web',String.valueOf(row.Id)+':'+field)); row.put(field,'Web');
            }
        }
        issue(approvals);
        Test.startTest(); Integer startCpu=Limits.getCpuTime(); Integer startQueries=Limits.getQueries();
        update rows;
        Integer cpu=Limits.getCpuTime()-startCpu; Integer heap=Limits.getHeapSize(); Integer queries=Limits.getQueries()-startQueries;
        System.debug(LoggingLevel.ERROR,'ARKHE_METRICS '+JSON.serialize(new Map<String,Integer>{
            'cpu_ms'=>cpu,'heap_bytes'=>heap,'queries'=>queries,
            'platform_cpu_limit_ms'=>Limits.getLimitCpuTime(),
            'platform_heap_limit_bytes'=>Limits.getLimitHeapSize(),
            'project_cpu_budget_ms'=>10000,'project_heap_budget_bytes'=>6000000}));
        System.assert(cpu<10000); System.assert(heap<6000000); System.assert(queries<=2);
        Test.stopTest();
        System.assertEquals(1000,[SELECT count() FROM Arkhe_Write_Approval__c WHERE Consumed_At__c!=null]);
    }
}
