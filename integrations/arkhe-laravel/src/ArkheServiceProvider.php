<?php

namespace Arkhe\Laravel;

use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class ArkheServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/arkhe.php', 'arkhe');
        $this->app->singleton(RunReporter::class, fn ($app) => new RunReporter($app['config']['arkhe']));
    }

    public function boot(): void
    {
        $this->publishes([__DIR__.'/../config/arkhe.php' => config_path('arkhe.php')], 'arkhe-config');

        Event::listen(ScheduledTaskFinished::class, function (ScheduledTaskFinished $event) {
            $this->app->make(RunReporter::class)->taskFinished($event);
        });
    }
}
