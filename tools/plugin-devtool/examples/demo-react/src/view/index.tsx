import React, { useEffect, useState } from 'react';
import { createPluginApi } from '@plug-box/plugin-sdk';
import './style.css';

export default function PluginView() {
  const [result, setResult] = useState('ready');

  useEffect(() => {
    void (async () => {
      const api = await createPluginApi();
      const value = await api.get('commands').execute('external.demo-react.ping');
      setResult(String(value));
    })();
  }, []);

  return (
    <div className="demo-view-root">
      <h2>Demo View</h2>
      <p>Command Result: {result}</p>
    </div>
  );
}

