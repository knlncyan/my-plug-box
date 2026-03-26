declare global {
  interface Window {
    React?: any;
  }
}

function getReact() {
  const react = window.React;
  if (!react) {
    throw new Error('[plugin-sdk] host React runtime not found on window.React');
  }
  return react;
}

const ReactProxy = new Proxy({}, {
  get(_target, prop: string | symbol) {
    return getReact()[prop as keyof ReturnType<typeof getReact>];
  },
});

export default ReactProxy as typeof import('react');

export const createElement = (...args: any[]) => getReact().createElement(...args);
export const Fragment = getReact().Fragment;
export const useState = <T,>(initial: T) => getReact().useState(initial) as [T, (value: T) => void];
export const useEffect = (effect: any, deps?: any[]) => getReact().useEffect(effect, deps);
export const useMemo = <T,>(factory: () => T, deps: any[]) => getReact().useMemo(factory, deps);
export const useRef = <T,>(value: T) => getReact().useRef(value);
export const useCallback = <T extends (...args: any[]) => any>(cb: T, deps: any[]) => getReact().useCallback(cb, deps);
export const useLayoutEffect = (effect: any, deps?: any[]) => getReact().useLayoutEffect(effect, deps);
export const useReducer = (...args: any[]) => getReact().useReducer(...args);
export const useContext = (...args: any[]) => getReact().useContext(...args);
export const useId = () => getReact().useId();
export const useTransition = () => getReact().useTransition();
export const useDeferredValue = <T,>(value: T) => getReact().useDeferredValue(value);
