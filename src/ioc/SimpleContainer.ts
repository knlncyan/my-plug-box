// 一个简单的，不依赖反射的ioc容器
type Constructor<T> = new (...args: any[]) => T;

type Factory<T> = (container: SimpleContainer) => T;

interface Registration<T> {
    factory: Factory<T>;
    isSingleton: boolean;
}

export class SimpleContainer {
    private registrations = new Map<Constructor<any>, Registration<any>>();
    private singletonInstances = new Map<Constructor<any>, any>();

    registerSingleton<T>(
        token: Constructor<T>,
        factory: Factory<T>
    ): void {
        this.registrations.set(token, { factory, isSingleton: true });
    }

    registerTransient<T>(
        token: Constructor<T>,
        factory: Factory<T>
    ): void {
        this.registrations.set(token, { factory, isSingleton: false });
    }

    resolve<T>(token: Constructor<T>): T {
        const reg = this.registrations.get(token);
        if (!reg) throw new Error(`Not registered: ${token.name}`);

        if (reg.isSingleton && this.singletonInstances.has(token)) {
            return this.singletonInstances.get(token);
        }

        const instance = reg.factory(this);

        if (reg.isSingleton) {
            this.singletonInstances.set(token, instance);
        }

        return instance;
    }
}