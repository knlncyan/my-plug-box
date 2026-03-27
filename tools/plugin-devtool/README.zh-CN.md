# Plug-Box 鎻掍欢寮€鍙戝伐鍏?
鐢ㄤ簬鍒涘缓鍜屾瀯寤哄閮ㄦ彃浠讹紝浜х墿缁撴瀯鐩存帴鍏煎 `public/plugins/<pluginId>/`銆?
## 鍛戒护

1. 鍒濆鍖栭」鐩?
```bash
node tools/plugin-devtool/bin/plugbox-plugin.mjs init my-plugin --framework react
# 鎴?node tools/plugin-devtool/bin/plugbox-plugin.mjs init my-plugin --framework vue
```

鍙€夊弬鏁帮細

- `--plugin-id external.my-plugin`锛氳嚜瀹氫箟鎻掍欢 ID銆?
2. 鏋勫缓鎻掍欢

```bash
node tools/plugin-devtool/bin/plugbox-plugin.mjs build my-plugin
# 鍦ㄩ」鐩洰褰曞唴涔熷彲鐩存帴锛?node ../tools/plugin-devtool/bin/plugbox-plugin.mjs build .
```

## 鏋勫缓浜х墿

榛樿杈撳嚭鍒帮細

`dist/<pluginId>/`

鍏稿瀷鏂囦欢锛?
- `index.js`锛堟彃浠堕€昏緫鍏ュ彛锛?- `view/index.js`锛堣鍥惧叆鍙ｏ紝鑻ラ厤缃簡 view锛?- `plugin.json`
- `icon.svg`锛堣嫢閰嶇疆浜?icon锛?- `assets/*`

閮ㄧ讲鏂瑰紡锛?
灏?`dist/<pluginId>` 鏁翠釜鐩綍澶嶅埗鍒帮細

`<app-root>/public/plugins/<pluginId>/`

鐒跺悗鍦ㄥ簲鐢ㄩ噷璋冪敤鍒锋柊鎻掍欢 API銆?
## 閰嶇疆鏂囦欢

姣忎釜鎻掍欢椤圭洰鍖呭惈 `plugbox.config.json`锛屾牳蹇冨瓧娈靛涓嬶細

- `pluginId`
- `name`
- `version`
- `activationEvents`
- `commands`
- `view`锛堝彲閫夛級
- `entries.module`
- `entries.view`锛堝綋 `view` 瀛樺湪鏃跺繀濉級
- `entries.icon`锛堝彲閫夛級
- `outDir`

## 鎻掍欢寮€鍙戞柟寮?
### 1) 閫昏緫鍏ュ彛锛坄src/index.ts`锛?
```ts
import type { PluginModule } from '@plug-box/plugin-sdk';

const plugin: PluginModule = {
  pluginId: 'external.demo',
  commands: {
    'external.demo.open': (ctx) => {
      ctx.api.get('views').activate('external.demo.main');
      return null;
    },
  },
};

export default plugin;
```

### 2) 瑙嗗浘鍏ュ彛锛堝 `src/view/index.tsx`锛?
```ts
import { createPluginApi } from '@plug-box/plugin-sdk';

const api = await createPluginApi();
await api.get('commands').execute('external.demo.open');
// 鎴?await api.call('commands.execute', { commandId: 'external.demo.open', args: [] });
```

## 鑳藉姏鎵╁睍涓庣被鍨嬫彁绀?
SDK 鏀寔澹版槑鍚堝苟鎵╁睍鑳藉姏绫诲瀷锛?
```ts
declare module '@plug-box/plugin-sdk' {
  interface PluginCapabilityMap {
    files: {
      open(path: string): Promise<void>;
    };
  }
}
```

涔嬪悗鍙洿鎺ヨ幏寰楃被鍨嬫彁绀猴細

```ts
const files = api.get('files');
await files.open('E:/demo.txt');
```

