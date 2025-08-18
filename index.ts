
export interface IDiFactory<T = unknown> {
    (...args: unknown[]): T
}

export interface IDiContainer {
    register(factory: IDiFactory): IDiContainer
}

export interface IDiRuntime {
    createContainer(): IDiContainer;
}