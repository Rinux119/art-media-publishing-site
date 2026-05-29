const createServerLifecycle = ({ app, defaultPort, logger = console } = {}) => {
    let activeServer = null;
    let shutdownInProgress = false;
    let handlersRegistered = false;
    let shutdownTimer = null;
    const trackedSockets = new Set();

    const normalizePort = (value) => {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed >= 0) return parsed;
        return value || 3000;
    };

    const shutdownServer = (server = activeServer) => new Promise((resolve, reject) => {
        if (!server) return resolve();
        if (shutdownInProgress) return resolve();
        shutdownInProgress = true;

        for (const socket of trackedSockets) {
            try {
                socket.end();
            } catch (_) {}
        }

        shutdownTimer = setTimeout(() => {
            for (const socket of trackedSockets) {
                try {
                    socket.destroy();
                } catch (_) {}
            }
        }, Number(process.env.SHUTDOWN_FORCE_CLOSE_MS) || 8_000);
        if (typeof shutdownTimer.unref === 'function') shutdownTimer.unref();

        server.close((err) => {
            if (shutdownTimer) clearTimeout(shutdownTimer);
            shutdownTimer = null;
            shutdownInProgress = false;
            activeServer = null;
            if (err) return reject(err);
            return resolve();
        });
    });

    const registerProcessHandlers = () => {
        if (handlersRegistered) return;
        handlersRegistered = true;

        const shutdownAndExit = (signal, exitCode = 0) => {
            shutdownServer().then(() => {
                logger.log(`Server stopped after ${signal}`);
                process.exit(exitCode);
            }).catch((err) => {
                logger.error(`Graceful shutdown failed after ${signal}:`, err);
                process.exit(1);
            });
        };

        process.on('SIGINT', () => shutdownAndExit('SIGINT'));
        process.on('SIGTERM', () => shutdownAndExit('SIGTERM'));
        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection:', reason);
        });
        process.on('uncaughtException', (err) => {
            logger.error('Uncaught exception:', err);
            shutdownAndExit('uncaughtException', 1);
        });
    };

    const startServer = ({ listenPort = defaultPort } = {}) => new Promise((resolve, reject) => {
        if (activeServer && activeServer.listening) return resolve(activeServer);

        const normalizedPort = normalizePort(listenPort);
        const server = app.listen(normalizedPort);
        activeServer = server;

        server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65_000;
        server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS) || 66_000;
        server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS) || 300_000;

        server.on('connection', (socket) => {
            trackedSockets.add(socket);
            socket.on('close', () => trackedSockets.delete(socket));
        });

        server.once('error', (err) => {
            activeServer = null;
            reject(err);
        });

        server.once('listening', () => {
            registerProcessHandlers();
            const address = server.address();
            const resolvedPort = address && typeof address === 'object' ? address.port : normalizedPort;
            logger.log(`Server running at http://localhost:${resolvedPort}`);
            resolve(server);
        });
    });

    return {
        startServer,
        shutdownServer
    };
};

module.exports = {
    createServerLifecycle
};
