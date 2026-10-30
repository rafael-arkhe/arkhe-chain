<?php

namespace Arkhe\Laravel;

use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Reports successful runs only. A failed, skipped or never-started run sends
 * nothing, and the Arkhe auditor records the silent window as an
 * AbsenceRecord. Reporting never throws into the scheduler: if the runtime is
 * unreachable the window also ends up absent, which is the fail-closed result.
 */
class RunReporter
{
    private const ID_PATTERN = '/^[A-Za-z0-9._@+\-\/:]{1,128}$/';

    public function __construct(private array $config)
    {
    }

    public function taskFinished(ScheduledTaskFinished $event): void
    {
        $module = $event->task->description;
        if (! is_string($module) || ! in_array($module, $this->config['report_tasks'] ?? [], true)) {
            return;
        }
        if ($event->task->exitCode !== 0) {
            return;
        }
        // One id per scheduled minute: HTTP retries of the same run reuse it,
        // so the runtime admits the run once and keeps its first admission time.
        $started = (int) floor(microtime(true) - $event->runtime);
        $this->report($module, $module.':'.gmdate('Y-m-d\TH:i\Z', $started - $started % 60));
    }

    public function report(string $module, string $executionId): bool
    {
        $version = (string) ($this->config['module_version'] ?? '');
        foreach ([$module, $version, $executionId] as $id) {
            if (! preg_match(self::ID_PATTERN, $id)) {
                Log::warning('arkhe: run not reported, invalid identifier', ['value' => $id]);

                return false;
            }
        }
        if (empty($this->config['url']) || empty($this->config['token'])) {
            Log::warning('arkhe: run not reported, ARKHE_URL or ARKHE_API_TOKEN missing');

            return false;
        }
        try {
            $response = Http::withToken($this->config['token'])
                ->acceptJson()
                ->timeout((int) ($this->config['timeout_seconds'] ?? 5))
                ->retry(3, 200, throw: false)
                ->post(rtrim($this->config['url'], '/').'/v1/runs', [
                    'module_id' => $module,
                    'module_version' => $version,
                    'execution_id' => $executionId,
                ]);
        } catch (Throwable $e) {
            Log::warning('arkhe: run not reported', ['module_id' => $module, 'error' => $e->getMessage()]);

            return false;
        }
        if (! $response->successful()) {
            Log::warning('arkhe: run not reported', ['module_id' => $module, 'status' => $response->status()]);

            return false;
        }

        return true;
    }
}
