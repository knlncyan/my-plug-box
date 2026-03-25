import { create, StoreApi, UseBoundStore } from 'zustand';

type ExtractUse<S> = S extends { getState: () => infer T }
    ? { (): T; <TSelect>(selector: (state: T) => TSelect, equals?: (a: TSelect, b: TSelect) => boolean): TSelect }
    : never;

type ExtractStore<S extends UseBoundStore<StoreApi<unknown>>> = Pick<S, 'getState' | 'setState' | 'subscribe'>;

const extractUse = <S extends UseBoundStore<StoreApi<unknown>>>(_store: S): ExtractUse<typeof _store> =>
    _store as any;
const extractStore = <S extends UseBoundStore<StoreApi<unknown>>>(_store: S): ExtractStore<typeof _store> =>
    _store;

type PopupState<TData = any, TAction = string, TExtraData = TData> = {
    open: boolean;
    action: TAction | undefined;
    data: TData | undefined;
    extraData: TExtraData | undefined;
};

export const createPopup = <TData = any, TAction = string, TExtraData = TData>() => {
    const defaultPopupState: PopupState<TData, TAction, TExtraData> = {
        open: false,
        action: undefined,
        data: undefined,
        extraData: undefined,
    };

    const _store = create<PopupState<TData, TAction, TExtraData>>()(() => defaultPopupState);

    const store = extractStore(_store);
    const use = extractUse(_store);
    // Partial是让所有类型变成可选的
    const show = (options?: Partial<Omit<PopupState<TData, TAction, TExtraData>, 'open'>>) => {
        _store.setState({ open: true, ...(options || {}) });
    };

    const hide = () => _store.setState({ open: false });
    const reset = () => _store.setState(defaultPopupState);

    return { store, use, show, hide, reset };
};

export const createAtom = <T>(initialState: T) => {
    const _store = create<T>()(() => initialState);

    const { getState, subscribe } = extractStore(_store);
    const use = extractUse(_store);

    const setState = (state: T | ((state: T) => T)) => _store.setState(state, true);

    const store = { getState, setState, subscribe };

    return { store, use };
};
