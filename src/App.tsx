import '@/lib/lifecycle/index'
import { useEffect, useState } from 'react';
import { Toaster } from './components/ui/sonner';
import WorkbenchLayout from './ui';
import lifecycleTrigger from './lib/lifecycleTrigger';
import { TooltipProvider } from './components/ui/tooltip';


export default function App() {
  const [initReady, setInitReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    void lifecycleTrigger.startInit().finally(() => {
      if (mounted) {
        setInitReady(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <TooltipProvider>
        {initReady ? (
          <WorkbenchLayout />
        ) : (
          <div className="flex h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-400">
            Loading workspace...
          </div>
        )}
        <Toaster />
      </TooltipProvider>
    </>
  )
};
