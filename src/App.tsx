import '@/lib/lifecycle/index'
import { Toaster } from './components/ui/sonner';
import WorkbenchLayout from './ui';
import lifecycleTrigger from './lib/lifecycleTrigger';
import { TooltipProvider } from './components/ui/tooltip';


export default function App() {
  lifecycleTrigger.startInit();

  return (
    <>
      <TooltipProvider>
        <WorkbenchLayout />
        <Toaster />
      </TooltipProvider>
    </>
  )
};
