type Function = () => Promise<void>;

class LifecycleTrigger {
    private initFunctions = new Set<Function>();
    private shutdownFunctions = new Set<Function>();

    register(f: Function, type: 'init' | 'shutdown') {
        if (type == 'init')
            this.initFunctions.add(f);
        else
            this.shutdownFunctions.add(f)
    }

    async startInit() {
        for (const init of this.initFunctions) {
            await init();
        }
    }

    async shutdownClose() {
        for (const shutdown of this.shutdownFunctions) {
            await shutdown();
        }
    }
}
export default new LifecycleTrigger();