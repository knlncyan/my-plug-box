type Function = () => Promise<void>;

class LifecycleTrigger {
    private initFunctions = new Set<Function>();
    private shutdownFunctions = new Set<Function>();
    private initPromise: Promise<void> | null = null;

    register(f: Function, type: 'init' | 'shutdown') {
        if (type == 'init')
            this.initFunctions.add(f);
        else
            this.shutdownFunctions.add(f)
    }

    async startInit() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            for (const init of this.initFunctions) {
                await init();
            }
        })();

        return this.initPromise;
    }

    async shutdownClose() {
        for (const shutdown of this.shutdownFunctions) {
            await shutdown();
        }
    }
}
export default new LifecycleTrigger();
