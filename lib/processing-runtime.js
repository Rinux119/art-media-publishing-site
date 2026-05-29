const os = require('os');
const crypto = require('crypto');

class PrioritySemaphore {
    constructor({ max, reservedForHigh = 0 } = {}) {
        this.max = Math.max(1, Number(max) || 1);
        this.reservedForHigh = Math.max(0, Math.min(this.max - 1, Number(reservedForHigh) || 0));
        this.active = 0;
        this.highQueue = [];
        this.lowQueue = [];
    }

    canRunHigh() {
        return this.active < this.max;
    }

    canRunLow() {
        const lowLimit = this.max - this.reservedForHigh;
        return this.active < lowLimit;
    }

    drain() {
        while (this.highQueue.length && this.canRunHigh()) {
            const next = this.highQueue.shift();
            if (next) next();
        }
        while (!this.highQueue.length && this.lowQueue.length && this.canRunLow()) {
            const next = this.lowQueue.shift();
            if (next) next();
        }
    }

    async withPriority(priority, fn) {
        if (typeof fn !== 'function') return;
        const isHigh = priority === 'high';
        const canRun = isHigh ? this.canRunHigh.bind(this) : this.canRunLow.bind(this);
        const queue = isHigh ? this.highQueue : this.lowQueue;

        if (!canRun()) {
            await new Promise((resolve) => queue.push(resolve));
        }
        this.active += 1;
        try {
            return await fn();
        } finally {
            this.active -= 1;
            this.drain();
        }
    }
}

const createBackgroundTaskQueue = ({ label, setImmediateImpl = setImmediate } = {}) => {
    const queue = [];
    let runnerActive = false;

    const run = async () => {
        if (runnerActive) return;
        runnerActive = true;
        try {
            while (queue.length) {
                const task = queue.shift();
                if (!task) continue;
                try {
                    await task();
                } catch (err) {
                    console.error(`${label} failed:`, err);
                }
            }
        } finally {
            runnerActive = false;
            if (queue.length) setImmediateImpl(run);
        }
    };

    return (task) => {
        if (typeof task !== 'function') return;
        queue.push(task);
        setImmediateImpl(run);
    };
};

const createProcessingRuntime = ({ sharp } = {}) => {
    const cpuCount = Math.max(1, (os.cpus() || []).length || 1);
    const imageProcessConcurrency = (() => {
        const raw = process.env.IMAGE_PROCESS_CONCURRENCY;
        const parsed = raw ? Number(raw) : NaN;
        if (!Number.isNaN(parsed) && parsed > 0) return Math.floor(parsed);
        return Math.max(1, Math.min(2, cpuCount));
    })();

    const sharpConcurrency = (() => {
        const raw = process.env.SHARP_CONCURRENCY;
        const parsed = raw ? Number(raw) : NaN;
        if (!Number.isNaN(parsed) && parsed > 0) return Math.floor(parsed);
        return Math.max(1, Math.floor(cpuCount / imageProcessConcurrency));
    })();

    const sharpCacheMemoryMb = (() => {
        const raw = process.env.SHARP_CACHE_MEMORY_MB;
        const parsed = raw ? Number(raw) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 0) return Math.floor(parsed);
        return 96;
    })();

    sharp.concurrency(sharpConcurrency);
    sharp.cache({ memory: sharpCacheMemoryMb, items: 256, files: 0 });

    const sharpInputOptions = { failOn: 'none', sequentialRead: true };
    const imageProcessingSemaphore = new PrioritySemaphore({
        max: imageProcessConcurrency,
        reservedForHigh: imageProcessConcurrency > 1 ? 1 : 0
    });
    const withImageProcessing = (priority, fn) => imageProcessingSemaphore.withPriority(priority, fn);

    const enqueueBackgroundImageTask = createBackgroundTaskQueue({ label: 'Background image task' });
    const enqueueBackgroundVideoTask = createBackgroundTaskQueue({ label: 'Background video task' });

    const processingJobs = new Map();
    const PROCESSING_JOB_TTL_MS = 60 * 60 * 1000;
    const PROCESSING_JOB_DONE_TTL_MS = 10 * 60 * 1000;

    const getProcessingJob = (jobId) => {
        if (!jobId) return null;
        const job = processingJobs.get(jobId);
        if (!job) return null;
        const now = Date.now();
        const ttl = job.status === 'completed' ? PROCESSING_JOB_DONE_TTL_MS : PROCESSING_JOB_TTL_MS;
        if (job.updatedAt + ttl < now) {
            processingJobs.delete(jobId);
            return null;
        }
        return job;
    };

    const createProcessingJob = ({ ownerUserId, totalSteps, redirectUrl }) => {
        const id = crypto.randomBytes(12).toString('hex');
        const now = Date.now();
        const normalizedTotal = Math.max(0, Number(totalSteps) || 0);
        const job = {
            id,
            ownerUserId,
            status: normalizedTotal === 0 ? 'completed' : 'running',
            totalSteps: normalizedTotal,
            doneSteps: 0,
            failedSteps: 0,
            currentStepLabel: '',
            createdAt: now,
            updatedAt: now,
            redirectUrl: typeof redirectUrl === 'string' ? redirectUrl : ''
        };
        processingJobs.set(id, job);
        return job;
    };

    const bumpProcessingJob = (jobId, { done = 0, failed = 0, label = '' } = {}) => {
        const job = getProcessingJob(jobId);
        if (!job) return;
        const doneInc = Math.max(0, Number(done) || 0);
        const failedInc = Math.max(0, Number(failed) || 0);
        job.doneSteps += doneInc;
        job.failedSteps += failedInc;
        if (label) job.currentStepLabel = label;
        job.updatedAt = Date.now();
        if (job.doneSteps + job.failedSteps >= job.totalSteps) {
            job.status = 'completed';
            job.currentStepLabel = '';
        }
    };

    return {
        sharpInputOptions,
        withImageProcessing,
        enqueueBackgroundImageTask,
        enqueueBackgroundVideoTask,
        getProcessingJob,
        createProcessingJob,
        bumpProcessingJob
    };
};

module.exports = {
    createProcessingRuntime
};
