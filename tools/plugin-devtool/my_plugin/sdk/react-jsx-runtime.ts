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

export const Fragment = getReact().Fragment;

export function jsx(type: any, props: any, key?: any) {
  const nextProps = key === undefined ? props : { ...props, key };
  return getReact().createElement(type, nextProps);
}

export const jsxs = jsx;

export function jsxDEV(type: any, props: any, key?: any) {
  const nextProps = key === undefined ? props : { ...props, key };
  return getReact().createElement(type, nextProps);
}
