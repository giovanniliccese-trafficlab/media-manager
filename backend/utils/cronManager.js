const cron = require('node-cron');

class CronManager {
  constructor() {
    this.scheduledTasks = new Map();
  }

  scheduleTask(taskId, cronExpression, callback) {
    // Remove existing schedule if any
    this.removeTask(taskId);

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`[CRON ERROR] Invalid cron expression for task ${taskId}: ${cronExpression}`);
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Log complete scheduling info
    console.log('='.repeat(80));
    console.log(`[CRON SCHEDULE] Task: ${taskId}`);
    console.log(`Cron Expression: ${cronExpression}`);
    console.log(`Timezone: ${process.env.TZ || 'Europe/Rome'}`);
    console.log(`Current Time: ${new Date().toLocaleString('it-IT', { timeZone: process.env.TZ || 'Europe/Rome' })}`);
    console.log(`Next Execution: ${this.getNextExecution(cronExpression)}`);
    console.log('='.repeat(80));

    // Schedule new task
    const task = cron.schedule(cronExpression, () => {
      console.log('='.repeat(80));
      console.log(`[CRON EXECUTE] Task ${taskId} triggered at ${new Date().toISOString()}`);
      console.log(`Cron Expression: ${cronExpression}`);
      console.log('='.repeat(80));
      callback();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Europe/Rome'
    });

    this.scheduledTasks.set(taskId, {
      task,
      expression: cronExpression,
      callback,
      scheduledAt: new Date().toISOString()
    });

    console.log(`[CRON SUCCESS] Task ${taskId} scheduled successfully`);
    return task;
  }

  removeTask(taskId) {
    const scheduled = this.scheduledTasks.get(taskId);
    if (scheduled) {
      scheduled.task.stop();
      this.scheduledTasks.delete(taskId);
      console.log(`[CRON REMOVE] Task ${taskId} schedule removed`);
      console.log(`  - Expression was: ${scheduled.expression}`);
      console.log(`  - Scheduled at: ${scheduled.scheduledAt}`);
    }
  }

  removeAllTasks() {
    console.log(`[CRON REMOVE ALL] Removing ${this.scheduledTasks.size} scheduled tasks`);
    for (const [taskId, scheduled] of this.scheduledTasks.entries()) {
      console.log(`  - Task: ${taskId}, Expression: ${scheduled.expression}`);
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    console.log('[CRON REMOVE ALL] All scheduled tasks removed');
  }

  getScheduledTasks() {
    const tasks = [];
    for (const [taskId, scheduled] of this.scheduledTasks.entries()) {
      tasks.push({
        taskId,
        expression: scheduled.expression,
        isRunning: scheduled.task.running,
        scheduledAt: scheduled.scheduledAt,
        nextExecution: this.getNextExecution(scheduled.expression)
      });
    }
    return tasks;
  }

  getNextExecution(cronExpression) {
    try {
      // Parse cron to estimate next execution
      const parts = cronExpression.split(' ');
      if (parts.length !== 5) return 'Invalid cron format';
      
      const [minute, hour, day, month] = parts;
      const now = new Date();
      
      return `Next: ${month}/${day} at ${hour}:${minute} (estimate)`;
    } catch (error) {
      return 'Could not calculate';
    }
  }

  // Convert time string (HH:mm) to cron expression for daily execution
  timeToCron(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.error(`[CRON ERROR] Invalid time format: ${timeString}`);
      throw new Error(`Invalid time format: ${timeString}`);
    }
    const cronExpr = `${minutes} ${hours} * * *`;
    console.log(`[CRON CONVERT] Time ${timeString} converted to cron: ${cronExpr}`);
    return cronExpr;
  }

  // List all active cron jobs
  listActiveCrons() {
    console.log('='.repeat(80));
    console.log('[CRON LIST] Active Scheduled Tasks');
    console.log('='.repeat(80));
    
    if (this.scheduledTasks.size === 0) {
      console.log('No scheduled tasks');
    } else {
      this.scheduledTasks.forEach((scheduled, taskId) => {
        console.log(`Task ID: ${taskId}`);
        console.log(`  Expression: ${scheduled.expression}`);
        console.log(`  Scheduled At: ${scheduled.scheduledAt}`);
        console.log(`  Is Running: ${scheduled.task.running}`);
        console.log(`  Next Exec: ${this.getNextExecution(scheduled.expression)}`);
        console.log('-'.repeat(80));
      });
    }
    console.log('='.repeat(80));
  }
}

module.exports = new CronManager();