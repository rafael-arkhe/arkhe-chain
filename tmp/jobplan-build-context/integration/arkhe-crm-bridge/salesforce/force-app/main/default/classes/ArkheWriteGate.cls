/** Candidate sandbox implementation. No callouts or crypto in the trigger. */
public without sharing class ArkheWriteGate {
    private static final Set<String> FIELDS = new Set<String>{
        'LeadSource', 'Arkhe_Test_1__c', 'Arkhe_Test_2__c', 'Arkhe_Test_3__c', 'Arkhe_Test_4__c'
    };
    // Ephemeral capability for exactly the DML below, never a recursion bypass.
    private static Map<Id, Datetime> consuming = new Map<Id, Datetime>();
    @TestVisible private static Set<Id> failAfterConsume = new Set<Id>();

    public static void approvalGuard(List<Arkhe_Write_Approval__c> rows,
        Map<Id, Arkhe_Write_Approval__c> oldRows, Boolean deleting) {
        for (Arkhe_Write_Approval__c row : rows) {
            if (deleting) { row.addError('ARKHE: approvals cannot be deleted.'); continue; }
            if (oldRows != null) {
                Arkhe_Write_Approval__c old = oldRows.get(row.Id);
                Boolean immutable = true;
                for (String field : new List<String>{'Event_Id__c', 'Org_Id__c', 'Target_Lead__c',
                    'Field_API_Name__c', 'New_Value__c', 'Is_Null__c', 'Expected_Version__c',
                    'Expires_At__c', 'Checkpoint_Hash__c', 'Request_Hash__c', 'Producer_Id__c'}) {
                    if (!same(row.get(field), old.get(field))) { immutable = false; }
                }
                if (!immutable || !consuming.containsKey(row.Id) || old.Consumed_At__c != null ||
                    row.Consumed_At__c != consuming.get(row.Id)) {
                    row.addError('ARKHE: approval is immutable; only gate consumption is permitted.');
                }
                continue;
            }
            if (!FeatureManagement.checkPermission('Arkhe_Issue_Approval')) {
                row.addError('ARKHE: issuer permission required.'); continue;
            }
            Datetime now = System.now();
            if (!String.valueOf(UserInfo.getOrganizationId()).equals(row.Org_Id__c) ||
                !FIELDS.contains(row.Field_API_Name__c) || row.Target_Lead__c == null ||
                row.Expected_Version__c == null || row.Consumed_At__c != null ||
                row.Expires_At__c == null || row.Expires_At__c <= now ||
                row.Expires_At__c > now.addMinutes(5) ||
                String.isBlank(row.Event_Id__c) || String.isBlank(row.Producer_Id__c) ||
                !isHash(row.Checkpoint_Hash__c) || !isHash(row.Request_Hash__c) ||
                (row.Is_Null__c && row.New_Value__c != null) ||
                (!row.Is_Null__c && String.isEmpty(row.New_Value__c))) {
                row.addError('ARKHE: invalid approval contract.');
            }
        }
    }

    private static Boolean isHash(String value) {
        return value != null && Pattern.matches('[0-9a-f]{64}', value);
    }
    private static Boolean same(Object a, Object b) {
        if (a == null || b == null) { return a == null && b == null; }
        // String == in Apex is case insensitive; field values must match exactly.
        if (a instanceof String && b instanceof String) { return ((String)a).equals((String)b); }
        return a == b;
    }

    private static void trace(String phase, Boolean afterUpdate, Set<Id> targets, Set<Id> approvals) {
        // Diagnostic only: emitted messages do not imply transaction commit.
        System.debug(LoggingLevel.INFO, 'ARKHE_GATE_TRACE '+JSON.serialize(new Map<String,Object>{
            'request_id'=>Request.getCurrent().getRequestId(), 'phase'=>phase,
            'at_ms'=>System.now().getTime(), 'after_update'=>afterUpdate,
            'lead_ids'=>targets, 'approval_ids'=>approvals}));
    }

    public static void handle(List<Lead> rows, Map<Id, Lead> oldRows, Boolean afterUpdate) {
        Map<Id, Set<String>> changes = new Map<Id, Set<String>>();
        for (Lead row : rows) {
            Set<String> changed = new Set<String>();
            for (String field : FIELDS) {
                if (!same(row.get(field), oldRows.get(row.Id).get(field))) { changed.add(field); }
            }
            if (!changed.isEmpty()) { changes.put(row.Id, changed); }
        }
        if (changes.isEmpty()) { return; }
        List<Arkhe_Write_Approval__c> candidates;
        Datetime now = System.now();
        Set<Id> targets = changes.keySet();
        trace('lock_attempt', afterUpdate, targets, new Set<Id>());
        try {
            candidates = [SELECT Id, Event_Id__c, Org_Id__c, Target_Lead__c, Field_API_Name__c,
                New_Value__c, Is_Null__c, Expected_Version__c, Expires_At__c, Consumed_At__c,
                Checkpoint_Hash__c, Request_Hash__c, Producer_Id__c
                FROM Arkhe_Write_Approval__c WHERE Target_Lead__c IN :targets
                AND Consumed_At__c = null AND Expires_At__c > :now LIMIT 2001 FOR UPDATE];
        } catch (QueryException error) {
            trace('lock_query_failed', afterUpdate, targets, new Set<Id>());
            reject(rows, changes, 'ARKHE: approvals unavailable; retry with fresh state.'); return;
        }
        Set<Id> lockedIds = new Set<Id>();
        for (Arkhe_Write_Approval__c a : candidates) { lockedIds.add(a.Id); }
        trace('lock_query_returned', afterUpdate, targets, lockedIds);
        if (candidates.size() > 2000) {
            reject(rows, changes, 'ARKHE: too many pending approvals; reconcile first.'); return;
        }
        // Recheck every predicate after locking. A refreshed row can no longer match WHERE.
        now = System.now();
        Map<Id, Map<String, List<Arkhe_Write_Approval__c>>> grouped =
            new Map<Id, Map<String, List<Arkhe_Write_Approval__c>>>();
        for (Arkhe_Write_Approval__c approval : candidates) {
            if (approval.Consumed_At__c != null || approval.Expires_At__c <= now ||
                !String.valueOf(UserInfo.getOrganizationId()).equals(approval.Org_Id__c) ||
                !changes.containsKey(approval.Target_Lead__c)) { continue; }
            if (!grouped.containsKey(approval.Target_Lead__c)) {
                grouped.put(approval.Target_Lead__c, new Map<String, List<Arkhe_Write_Approval__c>>());
            }
            Map<String, List<Arkhe_Write_Approval__c>> byField = grouped.get(approval.Target_Lead__c);
            if (!byField.containsKey(approval.Field_API_Name__c)) {
                byField.put(approval.Field_API_Name__c, new List<Arkhe_Write_Approval__c>());
            }
            byField.get(approval.Field_API_Name__c).add(approval);
        }
        List<Arkhe_Write_Approval__c> updates = new List<Arkhe_Write_Approval__c>();
        Map<Id, Datetime> expirations = new Map<Id, Datetime>();
        for (Lead row : rows) {
            if (!changes.containsKey(row.Id)) { continue; }
            Boolean valid = true;
            List<Arkhe_Write_Approval__c> selected = new List<Arkhe_Write_Approval__c>();
            Map<String, List<Arkhe_Write_Approval__c>> byField = grouped.get(row.Id);
            for (String field : changes.get(row.Id)) {
                List<Arkhe_Write_Approval__c> matches = new List<Arkhe_Write_Approval__c>();
                if (byField != null && byField.containsKey(field)) {
                    for (Arkhe_Write_Approval__c a : byField.get(field)) {
                        Object value = row.get(field);
                        if (a.Expected_Version__c == oldRows.get(row.Id).SystemModstamp &&
                            ((a.Is_Null__c && value == null) || (!a.Is_Null__c &&
                                value != null && String.valueOf(value).equals(a.New_Value__c)))) {
                            matches.add(a);
                        }
                    }
                }
                if (matches.size() != 1) { valid = false; }
                else { selected.add(matches[0]); }
            }
            if (!valid) { row.addError('ARKHE: exactly one current approval required per changed protected field.'); }
            else if (afterUpdate) {
                for (Arkhe_Write_Approval__c a : selected) {
                    updates.add(new Arkhe_Write_Approval__c(Id=a.Id, Consumed_At__c=now));
                    consuming.put(a.Id, now);
                    expirations.put(a.Id, a.Expires_At__c);
                }
            }
        }
        if (!updates.isEmpty()) {
            Datetime consumeAt = System.now();
            for (Arkhe_Write_Approval__c a : updates) {
                if (expirations.get(a.Id) <= consumeAt) {
                    consuming.clear();
                    reject(rows, changes, 'ARKHE: approval expired before consumption; obtain fresh approvals.');
                    return;
                }
                a.Consumed_At__c = consumeAt;
                consuming.put(a.Id, consumeAt);
            }
            trace('consume_attempt', afterUpdate, targets, consuming.keySet());
            try {
                update updates;
                trace('consume_dml_returned', afterUpdate, targets, consuming.keySet());
            }
            finally { consuming.clear(); }
        }
        if (afterUpdate && Test.isRunningTest()) {
            for (Lead row : rows) {
                if (failAfterConsume.contains(row.Id)) { row.addError('ARKHE: injected downstream failure.'); }
            }
        }
    }
    private static void reject(List<Lead> rows, Map<Id, Set<String>> changes, String message) {
        for (Lead row : rows) { if (changes.containsKey(row.Id)) { row.addError(message); } }
    }
}
