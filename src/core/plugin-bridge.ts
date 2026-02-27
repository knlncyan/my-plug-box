/**
 * PluginBridge — iframe sandbox for external plugins.
 *
 * External plugins run inside an isolated <iframe srcdoc="..."> and
 * communicate with the host via a MessageChannel.
 *
 * Protocol
 * ────────
 * After the iframe loads, the host posts an __INIT__ message with port2.
 * The plugin uses port2 to send PluginToHostMsg and receive HostToPluginMsg.
 *
 * Usage
 * ─────
 *   const bridge = new PluginBridge('my-plugin', registries);
 *   await bridge.load(pluginJsSource);
 *   // ...later...
 *   bridge.dispose();
 */

import type { Disposable } from './types';
import { DisposableStore } from './disposable';
import type { CommandRegistry } from './command-registry';
import type { EventBus } from './event-bus';
import type { SettingsRegistry } from './settings-registry';

// ─── Message Types ─────────────────────────────────────────────────────────────

/** Messages sent FROM the plugin (inside iframe) TO the host. */
export type PluginToHostMsg =
  | { type: 'REGISTER_COMMAND'; id: string; callbackId: string }
  | { type: 'EXECUTE_COMMAND'; id: string; args: unknown[]; reqId: string }
  | { type: 'EMIT_EVENT'; event: string; data: unknown }
  | { type: 'GET_SETTING'; key: string; reqId: string }
  | { type: 'SET_SETTING'; key: string; value: unknown }
  | { type: 'REGISTER_VIEW'; viewId: string };

/** Messages sent FROM the host TO the plugin (inside iframe). */
export type HostToPluginMsg =
  | { type: 'CALL_HANDLER'; callbackId: string; args: unknown[] }
  | { type: 'COMMAND_RESULT'; reqId: string; result?: unknown; error?: string }
  | { type: 'SETTING_VALUE'; reqId: string; value: unknown }
  | { type: 'EVENT'; event: string; data: unknown };

// ─── PluginBridge ──────────────────────────────────────────────────────────────

interface BridgeRegistries {
  commands: CommandRegistry;
  events: EventBus;
  settings: SettingsRegistry;
}

export class PluginBridge implements Disposable {
  private readonly _iframe: HTMLIFrameElement;
  private readonly _channel = new MessageChannel();
  private readonly _store = new DisposableStore();

  constructor(
    private readonly _pluginId: string,
    private readonly _registries: BridgeRegistries
  ) {
    this._iframe = document.createElement('iframe');
    this._iframe.style.display = 'none';
    this._iframe.setAttribute('sandbox', 'allow-scripts');
    this._channel.port1.onmessage = (e: MessageEvent<PluginToHostMsg>) =>
      this._handleMessage(e.data);
    document.body.appendChild(this._iframe);
  }

  /**
   * Load plugin JavaScript source into the sandbox.
   * The source is embedded in a minimal HTML page via `srcdoc`.
   */
  load(pluginCode: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this._iframe.onload = () => {
        // Hand over port2 to the iframe
        this._iframe.contentWindow?.postMessage(
          { type: '__INIT__', pluginId: this._pluginId },
          '*',
          [this._channel.port2]
        );
        resolve();
      };
      this._iframe.srcdoc = buildSandboxHtml(pluginCode);
    });
  }

  dispose(): void {
    this._store.dispose();
    this._channel.port1.close();
    this._iframe.remove();
  }

  // ── Message handling ──────────────────────────────────────────────────────

  private _handleMessage(msg: PluginToHostMsg): void {
    const { commands, events, settings } = this._registries;

    switch (msg.type) {
      case 'REGISTER_COMMAND': {
        const { id, callbackId } = msg;
        const handler = (...args: unknown[]) => {
          this._send({ type: 'CALL_HANDLER', callbackId, args });
          // Fire-and-forget; return value from external plugins not supported yet
        };
        this._store.add(
          commands.register(id, handler, { pluginId: this._pluginId, title: id })
        );
        break;
      }

      case 'EXECUTE_COMMAND': {
        commands
          .execute(msg.id, ...msg.args)
          .then((result) => this._send({ type: 'COMMAND_RESULT', reqId: msg.reqId, result }))
          .catch((e: unknown) =>
            this._send({ type: 'COMMAND_RESULT', reqId: msg.reqId, error: String(e) })
          );
        break;
      }

      case 'EMIT_EVENT': {
        events.emit(msg.event, msg.data);
        break;
      }

      case 'GET_SETTING': {
        const value = settings.get(msg.key);
        this._send({ type: 'SETTING_VALUE', reqId: msg.reqId, value: value ?? null });
        break;
      }

      case 'SET_SETTING': {
        settings.set(msg.key, msg.value);
        break;
      }

      case 'REGISTER_VIEW': {
        // View rendering for external plugins is handled by registering an
        // iframe URL; the plugin must call this from its activate() function.
        // For now, this is a no-op — use ViewRegistry.registerIframe() externally.
        console.log(`[PluginBridge:${this._pluginId}] REGISTER_VIEW "${msg.viewId}" received.`);
        break;
      }
    }
  }

  private _send(msg: HostToPluginMsg): void {
    this._channel.port1.postMessage(msg);
  }
}

// ─── Sandbox HTML builder ──────────────────────────────────────────────────────

/**
 * Build the full HTML page that will be injected into the iframe via srcdoc.
 * It injects a `window.pluginAPI` proxy that tunnels calls through the
 * MessageChannel established by the host.
 */
function buildSandboxHtml(pluginCode: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
// ── Sandbox glue ─────────────────────────────────────────────
(function () {
  'use strict';
  let _port = null;
  const _pending = new Map();   // reqId → resolve
  const _handlers = new Map();  // callbackId → handler

  function uid() { return Math.random().toString(36).slice(2); }
  function send(msg) { _port && _port.postMessage(msg); }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === '__INIT__') {
      _port = e.ports[0];
      _port.onmessage = function (ev) { handleHostMsg(ev.data); };
      if (typeof activate === 'function') activate(window.pluginAPI);
    }
  });

  function handleHostMsg(msg) {
    if (msg.type === 'CALL_HANDLER') {
      var h = _handlers.get(msg.callbackId);
      if (h) h.apply(null, msg.args || []);
    } else if (msg.type === 'COMMAND_RESULT' || msg.type === 'SETTING_VALUE') {
      var resolve = _pending.get(msg.reqId);
      if (resolve) { resolve(msg.result !== undefined ? msg.result : msg.value); _pending.delete(msg.reqId); }
    } else if (msg.type === 'EVENT') {
      window.dispatchEvent(new CustomEvent('__plugin_event__' + msg.event, { detail: msg.data }));
    }
  }

  window.pluginAPI = {
    commands: {
      register: function (id, handler) {
        var callbackId = uid();
        _handlers.set(callbackId, handler);
        send({ type: 'REGISTER_COMMAND', id: id, callbackId: callbackId });
      },
      execute: function (id) {
        var args = Array.prototype.slice.call(arguments, 1);
        var reqId = uid();
        return new Promise(function (resolve) {
          _pending.set(reqId, resolve);
          send({ type: 'EXECUTE_COMMAND', id: id, args: args, reqId: reqId });
        });
      },
    },
    events: {
      emit: function (event, data) { send({ type: 'EMIT_EVENT', event: event, data: data }); },
      on: function (event, handler) {
        function listener(e) { handler(e.detail); }
        window.addEventListener('__plugin_event__' + event, listener);
        return { dispose: function () { window.removeEventListener('__plugin_event__' + event, listener); } };
      },
    },
    settings: {
      get: function (key) {
        var reqId = uid();
        return new Promise(function (resolve) {
          _pending.set(reqId, resolve);
          send({ type: 'GET_SETTING', key: key, reqId: reqId });
        });
      },
      set: function (key, value) { send({ type: 'SET_SETTING', key: key, value: value }); },
    },
  };
}());
<\/script>
<script>
${pluginCode}
<\/script>
</body>
</html>`;
}
