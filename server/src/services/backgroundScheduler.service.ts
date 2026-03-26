import { getWorkflowConfigSnapshot } from './workflowConfig.service';
import { runMaintenanceReminderWorker } from './maintenanceReminderWorker.service';
import { runThresholdAlertWorker } from './thresholdAlertWorker.service';

type JobName = 'maintenance-reminders' | 'threshold-alerts';

type SchedulerState = {
  stopped: boolean;
  timers: NodeJS.Timeout[];
  running: Record<JobName, boolean>;
};

let schedulerState: SchedulerState | null = null;

function scheduleNext(state: SchedulerState, callback: () => Promise<void>, delayMs: number) {
  const safeDelay = Number.isFinite(delayMs) && delayMs > 0 ? Math.floor(delayMs) : 60_000;
  // Declare before assignment so the callback can reference it for self-removal.
  let timer: NodeJS.Timeout;
  timer = setTimeout(async () => {
    // Remove this handle as soon as it fires — keeps state.timers to only
    // currently-pending timers instead of accumulating every historical handle.
    const idx = state.timers.indexOf(timer);
    if (idx !== -1) state.timers.splice(idx, 1);
    if (state.stopped) return;
    try {
      await callback();
    } catch (error) {
      console.error('[scheduler] job cycle failed:', error);
    }
  }, safeDelay);
  state.timers.push(timer);
}

async function runJobCycle(
  state: SchedulerState,
  jobName: JobName,
  intervalKey: 'maintenance_interval_minutes' | 'threshold_interval_minutes',
  runner: () => Promise<void>
) {
  const config = await getWorkflowConfigSnapshot({ forceRefresh: true });
  const schedulerConfig = config.scheduler;

  const intervalMinutes = Number(schedulerConfig[intervalKey] || 0);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  if (!schedulerConfig.enabled) {
    scheduleNext(state, () => runJobCycle(state, jobName, intervalKey, runner), 60_000);
    return;
  }

  if (state.running[jobName]) {
    scheduleNext(state, () => runJobCycle(state, jobName, intervalKey, runner), intervalMs);
    return;
  }

  state.running[jobName] = true;
  try {
    await runner();
  } catch (error) {
    console.error(`[scheduler] ${jobName} failed:`, error);
  } finally {
    state.running[jobName] = false;
  }

  scheduleNext(state, () => runJobCycle(state, jobName, intervalKey, runner), intervalMs);
}

export async function startBackgroundScheduler() {
  if (schedulerState && !schedulerState.stopped) {
    return;
  }

  const config = await getWorkflowConfigSnapshot({ forceRefresh: true });
  const startupDelayMs = Math.max(1, Number(config.scheduler.startup_delay_seconds || 15)) * 1000;
  const state: SchedulerState = {
    stopped: false,
    timers: [],
    running: {
      'maintenance-reminders': false,
      'threshold-alerts': false,
    },
  };
  schedulerState = state;

  scheduleNext(
    state,
    () => runJobCycle(state, 'maintenance-reminders', 'maintenance_interval_minutes', runMaintenanceReminderWorker),
    startupDelayMs
  );
  scheduleNext(
    state,
    () => runJobCycle(state, 'threshold-alerts', 'threshold_interval_minutes', runThresholdAlertWorker),
    startupDelayMs
  );
}

export function stopBackgroundScheduler() {
  if (!schedulerState) return;
  schedulerState.stopped = true;
  schedulerState.timers.forEach((timer) => clearTimeout(timer));
  schedulerState.timers = [];
}
