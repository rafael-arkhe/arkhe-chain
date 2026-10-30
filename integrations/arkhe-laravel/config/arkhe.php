<?php

return [
    // Base URL of arkhe-runtime, e.g. https://arkhe.internal:8788
    'url' => env('ARKHE_URL'),

    // Same bearer token as ARKHE_API_TOKEN on the runtime (at least 32 bytes).
    'token' => env('ARKHE_API_TOKEN'),

    // Release identifier of this application (git SHA, tag). Part of every WER.
    'module_version' => env('ARKHE_MODULE_VERSION', 'unversioned'),

    // Only tasks named here are reported. Name them in the scheduler with
    // ->name('billing-cron'); the name becomes the WER module_id and must
    // match the module_id of the ExecutionExpectation.
    'report_tasks' => [
        // 'billing-cron',
    ],

    'timeout_seconds' => 5,
];
